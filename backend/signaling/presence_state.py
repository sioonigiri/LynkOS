"""
近傍デバイス一覧のメモリ内レジストリ。
HTTP POST と Presence WebSocket（device-info）の両方から更新する。

同一 Wi-Fi 上の端末のみ相互に見えるよう、公開 IP（_client_ip）でスコープする。
"""
import time
from typing import Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

PRESENCE_GROUP = 'lynkos_presence'

DEVICE_TTL = 45
ICON_MAX_LEN = 400_000

_online_devices: dict[str, dict] = {}


def presence_group_for(client_ip: str) -> str:
    """Presence 通知用の channel group 名（IP ごとに分離）。"""
    if not client_ip:
        return PRESENCE_GROUP
    safe = client_ip.replace(':', '_')
    return f'{PRESENCE_GROUP}_{safe}'


def _notify_devices_changed(client_ip: str = ''):
    try:
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                presence_group_for(client_ip),
                {'type': 'presence_ping'},
            )
    except Exception:
        pass


def _active_devices(for_client_ip: Optional[str] = None):
    now = time.time()
    devices = [d for d in _online_devices.values() if now - d['_ts'] < DEVICE_TTL]
    if for_client_ip:
        devices = [d for d in devices if d.get('_client_ip') == for_client_ip]
    return devices


def active_devices_public(for_client_ip: Optional[str] = None):
    return [
        {k: v for k, v in d.items() if not k.startswith('_')}
        for d in _active_devices(for_client_ip)
    ]


def register_from_http(
    device_id: str,
    name,
    type_,
    platform,
    icon_raw,
    client_ip: str = '',
):
    if isinstance(icon_raw, str):
        icon = icon_raw.strip()[:ICON_MAX_LEN]
    else:
        icon = ''
    _online_devices[device_id] = {
        'deviceId': device_id,
        'name': name if isinstance(name, str) else '不明なデバイス',
        'type': type_ if isinstance(type_, str) else 'unknown',
        'platform': platform if isinstance(platform, str) else '',
        **({'icon': icon} if icon else {}),
        '_client_ip': client_ip,
        '_ts': time.time(),
    }
    _notify_devices_changed(client_ip)


def remove_device(device_id: str):
    existing = _online_devices.pop(device_id, None)
    client_ip = existing.get('_client_ip', '') if existing else ''
    _notify_devices_changed(client_ip)


def merge_from_ws_device_payload(dev: dict, client_ip: str = '') -> Optional[dict]:
    """
    クライアントからの device-info をマージし、ブロードキャスト用の公開 dict を返す。
    deviceId または id を受け付ける。
    """
    if not isinstance(dev, dict):
        return None
    device_id = dev.get('deviceId') or dev.get('id')
    if not isinstance(device_id, str) or not device_id:
        return None
    if len(device_id) > 512 or '..' in device_id:
        return None

    existing = _online_devices.get(device_id, {})

    raw_name = dev.get('name')
    if isinstance(raw_name, str) and raw_name.strip():
        name = raw_name.strip()
    else:
        name = existing.get('name', '不明なデバイス')

    type_ = dev.get('type') if isinstance(dev.get('type'), str) else existing.get('type', 'unknown')
    platform = (
        dev.get('platform')
        if isinstance(dev.get('platform'), str)
        else existing.get('platform', '')
    )

    icon_in = dev.get('icon')
    entry = {
        'deviceId': device_id,
        'name': name,
        'type': type_,
        'platform': platform,
        '_client_ip': client_ip or existing.get('_client_ip', ''),
        '_ts': time.time(),
    }

    if isinstance(icon_in, str):
        trimmed = icon_in.strip()[:ICON_MAX_LEN]
        if trimmed:
            entry['icon'] = trimmed
        elif icon_in.strip() == '':
            pass
        elif 'icon' in existing:
            entry['icon'] = existing['icon']
    elif 'icon' in existing:
        entry['icon'] = existing['icon']

    _online_devices[device_id] = entry
    public = {k: v for k, v in entry.items() if not k.startswith('_')}
    return public
