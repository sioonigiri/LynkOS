import time
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import JsonResponse

from signaling.consumers import PRESENCE_GROUP

DEVICE_TTL = 45  # ハートビート(8s)に余裕を持たせ、一時的な遅延で端末が消えないようにする

_online_devices: dict[str, dict] = {}


def _notify_devices_changed():
    """端末の登録・削除時に、一覧を購読中の全クライアントへ即時通知する。"""
    try:
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                PRESENCE_GROUP,
                {'type': 'presence_ping'},
            )
    except Exception:
        pass


def _active_devices():
    now = time.time()
    return [d for d in _online_devices.values() if now - d['_ts'] < DEVICE_TTL]


class DeviceListView(APIView):
    def get(self, request):
        active = _active_devices()
        return Response([{k: v for k, v in d.items() if k != '_ts'} for d in active])

    def post(self, request):
        device_id = request.data.get('deviceId')
        if not device_id:
            return Response({'error': 'deviceId is required'}, status=400)

        _online_devices[device_id] = {
            'deviceId':  device_id,
            'name':      request.data.get('name', '不明なデバイス'),
            'type':      request.data.get('type', 'unknown'),
            'platform':  request.data.get('platform', ''),
            '_ts':       time.time(),
        }
        _notify_devices_changed()
        return Response({'status': 'ok'})

    def delete(self, request):
        device_id = request.data.get('deviceId')
        _online_devices.pop(device_id, None)
        _notify_devices_changed()
        return Response({'status': 'removed'})


class DeviceDeleteView(APIView):
    """sendBeacon（POST）から呼ばれる削除専用エンドポイント。"""

    def post(self, request):
        device_id = request.data.get('deviceId')
        _online_devices.pop(device_id, None)
        _notify_devices_changed()
        return Response({'status': 'removed'})


def health_check(request):
    """Watchdog や監視ツール向けのヘルスチェックエンドポイント。"""
    return JsonResponse({
        'status': 'ok',
        'devices': len(_active_devices()),
        'ts': time.time(),
    })
