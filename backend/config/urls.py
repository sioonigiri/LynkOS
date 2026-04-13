import os
import mimetypes
from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import FileResponse, Http404, HttpResponse

FRONTEND_DIST = os.path.normcase(str(settings.FRONTEND_DIST))


def serve_react(request, path=''):
    """
    React SPA を配信するビュー。
    - path にファイルが存在すれば返す（JS, CSS, 画像など）
    - 存在しなければ index.html を返す（SPA ルーティング）
    """
    if path:
        file_path = os.path.normcase(os.path.normpath(os.path.join(FRONTEND_DIST, path)))
        # パストラバーサル対策（Windows の大文字小文字差を吸収）
        if not file_path.startswith(FRONTEND_DIST):
            raise Http404
        if os.path.isfile(file_path):
            content_type, _ = mimetypes.guess_type(file_path)
            return FileResponse(
                open(file_path, 'rb'),
                content_type=content_type or 'application/octet-stream',
            )

    # SPA フォールバック: index.html
    index_path = os.path.join(FRONTEND_DIST, 'index.html')
    if not os.path.exists(index_path):
        return HttpResponse(
            '<h1>LynkOS</h1>'
            '<p>フロントエンドがビルドされていません。</p>'
            '<p><code>cd frontend &amp;&amp; npm run build</code> を実行してください。</p>',
            content_type='text/html; charset=utf-8',
            status=503,
        )
    return FileResponse(open(index_path, 'rb'), content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('signaling.urls')),
    # React SPA（API 以外の全パスをキャッチ）
    re_path(r'^(?P<path>.*)$', serve_react),
]
