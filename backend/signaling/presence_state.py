"""
近傍デバイス一覧のメモリ内レジストリ。
HTTP POST と Presence WebSocket（device-info）の両方から更新する。

一覧の見え方が変わったとき（新規・内容変更・グループ移動・削除・TTL 切れ）だけ
devices-changed を通知する。内容が同じ heartbeat では通知しない
（クライアントが通知を受けて再登録すると通知→登録→通知…の無限ループになるため）。

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


def _public(entry: dict) -> dict:
    return {k: v for k, v in entry.items() if not k.startswith('_')}


def _sweep_expired(now: float):
    """TTL 切れの端末を削除し、所属していたグループに一覧の変化を通知する。"""
    expired = [d for d in _online_devices.values() if now - d['_ts'] >= DEVICE_TTL]
    for d in expired:
        _online_devices.pop(d['deviceId'], None)
    for client_ip in {d.get('_client_ip', '') for d in expired}:
        _notify_devices_changed(client_ip)


def _store(entry: dict) -> bool:
    """端末を保存し、一覧の見え方が変わった場合だけ通知する。変わったら True。"""
    _sweep_expired(entry['_ts'])
    previous = _online_devices.get(entry['deviceId'])
    _online_devices[entry['deviceId']] = entry

    new_ip = entry.get('_client_ip', '')
    if previous is None:
        _notify_devices_changed(new_ip)
        return True
    old_ip = previous.get('_client_ip', '')
    if old_ip != new_ip:
        _notify_devices_changed(old_ip)
        _notify_devices_changed(new_ip)
        return True
    if _public(previous) != _public(entry):
        _notify_devices_changed(new_ip)
        return True
    return False


def _active_devices(for_client_ip: Optional[str] = None):
    _sweep_expired(time.time())
    devices = list(_online_devices.values())
    if for_client_ip:
        devices = [d for d in devices if d.get('_client_ip') == for_client_ip]
    return devices


def active_devices_public(for_client_ip: Optional[str] = None):
    return [_public(d) for d in _active_devices(for_client_ip)]


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
    _store({
        'deviceId': device_id,
        'name': name if isinstance(name, str) else '不明なデバイス',
        'type': type_ if isinstance(type_, str) else 'unknown',
        'platform': platform if isinstance(platform, str) else '',
        **({'icon': icon} if icon else {}),
        '_client_ip': client_ip,
        '_ts': time.time(),
    })


def remove_device(device_id: str):
    existing = _online_devices.pop(device_id, None)
    if existing:
        _notify_devices_changed(existing.get('_client_ip', ''))


def merge_from_ws_device_payload(dev: dict, client_ip: str = '') -> Optional[dict]:
    """
    クライアントからの device-info をマージし、一覧の見え方が変わった場合だけ
    ブロードキャスト用の公開 dict を返す（変化なしなら None）。
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

    if not _store(entry):
        return None
    return _public(entry)
