"""LAN 上で LynkOS シグナリングサーバーを Bonjour (`_lynkos-hub._tcp`) 広告する。"""
from __future__ import annotations

import atexit
import os
import socket
import threading

_SERVICE_TYPE = '_lynkos-hub._tcp.local.'
_NAME = 'LynkOS Hub'
_lock = threading.Lock()
_started = False
_zeroconf = None
_info = None


def _local_lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('8.8.8.8', 80))
            ip = sock.getsockname()[0]
    except OSError:
        return None
    if ip.startswith('127.') or ip.startswith('169.254.'):
        return None
    return ip


def _hub_port() -> int:
    raw = os.environ.get('LYNKOS_HUB_PORT', '8000').strip()
    try:
        return int(raw)
    except ValueError:
        return 8000


def start_hub_advertisement() -> bool:
    """Django 起動時にバックグラウンドで mDNS 広告を開始する。成功時 True。"""
    global _started, _zeroconf, _info

    if os.environ.get('LYNKOS_DISABLE_MDNS', '').lower() in ('1', 'true', 'yes'):
        return False

    with _lock:
        if _started:
            return True

        ip = _local_lan_ip()
        if not ip:
            return False

        port = _hub_port()
        origin = f'http://{ip}:{port}'

        try:
            from zeroconf import ServiceInfo, Zeroconf
        except ImportError:
            print('[LynkOS/mDNS] zeroconf not installed — pip install zeroconf')
            return False

        try:
            zc = Zeroconf()
            info = ServiceInfo(
                _SERVICE_TYPE,
                f'{_NAME}.{_SERVICE_TYPE}',
                addresses=[socket.inet_aton(ip)],
                port=port,
                properties={'origin': origin.encode('utf-8')},
            )
            zc.register_service(info)
        except Exception:
            return False

        _zeroconf = zc
        _info = info
        _started = True

        def _stop() -> None:
            global _zeroconf, _info, _started
            with _lock:
                if _zeroconf and _info:
                    try:
                        _zeroconf.unregister_service(_info)
                    except Exception:
                        pass
                    try:
                        _zeroconf.close()
                    except Exception:
                        pass
                _zeroconf = None
                _info = None
                _started = False

        atexit.register(_stop)
        print(f'[LynkOS/mDNS] Hub advertised: {origin}')
        return True
