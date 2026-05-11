import time
from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response

from signaling import presence_state
class DeviceListView(APIView):
    def get(self, request):
        return Response(presence_state.active_devices_public())

    def post(self, request):
        device_id = request.data.get('deviceId')
        if not device_id:
            return Response({'error': 'deviceId is required'}, status=400)

        presence_state.register_from_http(
            device_id,
            request.data.get('name', '不明なデバイス'),
            request.data.get('type', 'unknown'),
            request.data.get('platform', ''),
            request.data.get('icon'),
        )
        return Response({'status': 'ok'})

    def delete(self, request):
        device_id = request.data.get('deviceId')
        presence_state.remove_device(device_id)
        return Response({'status': 'removed'})


class DeviceDeleteView(APIView):
    """sendBeacon（POST）から呼ばれる削除専用エンドポイント。"""

    def post(self, request):
        device_id = request.data.get('deviceId')
        presence_state.remove_device(device_id)
        return Response({'status': 'removed'})


def health_check(request):
    """Watchdog や監視ツール向けのヘルスチェックエンドポイント。"""
    return JsonResponse({
        'status': 'ok',
        'devices': len(presence_state.active_devices_public()),
        'ts': time.time(),
    })
