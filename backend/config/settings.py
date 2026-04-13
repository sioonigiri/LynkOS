import mimetypes
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ── 環境フラグ ─────────────────────────────────
# 本番既定は False。ローカルで runserver する場合は DJANGO_DEBUG=true
DEBUG = os.environ.get('DJANGO_DEBUG', 'false').lower() in ('1', 'true', 'yes')

# ── 秘密鍵（環境変数）──────────────────────────
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '').strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-local-only-set-DJANGO_SECRET_KEY-for-production'
    else:
        raise ValueError('環境変数 DJANGO_SECRET_KEY を設定してください。')

# ── ホスト（環境変数・カンマ区切り）────────────
def _split_csv(name):
    raw = os.environ.get(name, '')
    return [x.strip() for x in raw.split(',') if x.strip()]


ALLOWED_HOSTS = _split_csv('DJANGO_ALLOWED_HOSTS')

# Render / Railway 等のリバースプロキシ（HTTPS 判定）
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    if os.environ.get('DJANGO_SECURE_SSL_REDIRECT', '').lower() in ('1', 'true', 'yes'):
        SECURE_SSL_REDIRECT = True

# フロントが別ドメインのときのみ CORS を有効化（環境変数が空ならミドルウェアも載せない）
_cors_origins = _split_csv('CORS_ALLOWED_ORIGINS')
_csrf_explicit = _split_csv('CSRF_TRUSTED_ORIGINS')

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = _cors_origins

if _cors_origins:
    if _csrf_explicit:
        CSRF_TRUSTED_ORIGINS = _csrf_explicit
    else:
        CSRF_TRUSTED_ORIGINS = list(_cors_origins)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'corsheaders',
    'rest_framework',
    'signaling',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

if _cors_origins:
    MIDDLEWARE.insert(0, 'corsheaders.middleware.CorsMiddleware')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

ASGI_APPLICATION = 'config.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

LANGUAGE_CODE = 'ja'
TIME_ZONE = 'Asia/Tokyo'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
    },
}

FRONTEND_DIST = Path(
    os.environ.get('LYNKOS_FRONTEND_DIST', str(BASE_DIR.parent / 'frontend' / 'dist'))
).resolve()

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('text/javascript', '.mjs')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
