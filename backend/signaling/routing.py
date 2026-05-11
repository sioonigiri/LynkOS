from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/presence/$', consumers.PresenceConsumer.as_asgi()),
    re_path(
        r'ws/inbox/(?P<device_id>[^/]+)/$',
        consumers.InboxConsumer.as_asgi(),
    ),
    # ルーム名は deviceId のソート結合（英数字・_・- など）。厳しすぎる \w のみだと取りこぼす場合があるためパス1セグメントを許可
    re_path(r'ws/signal/(?P<room_name>[^/]+)/$', consumers.SignalingConsumer.as_asgi()),
]
