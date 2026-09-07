#!/usr/bin/env bash
# GymEntra — iPhone 16e simülatör yardımcı script'i.
#
# Kullanım:
#   ./scripts/sim.sh                    Simülatörü/Metro'yu ayağa kaldırır, Expo Go'yu açar
#   ./scripts/sim.sh admin/checkin       Yukarıdakini yapar + doğrudan o ekrana deep-link atar
#   ./scripts/sim.sh status              Hiçbir şey başlatmaz, sadece mevcut durumu gösterir
#
# Geçerli route örnekleri (src/app altındaki dosya yollarıyla birebir):
#   admin/checkin  admin/index  admin/members  admin/classes  admin/payments  admin/settings
#   member/index   member/card  member/classes member/progress
#   trainer/index  trainer/calendar trainer/builder trainer/profile
#   onboarding/register  onboarding/gym-code  onboarding/pending  onboarding/approved
#   checkin-success  paywall  states

set -euo pipefail

DEVICE_NAME="iPhone 16e"
BUNDLE_ID="host.exp.Exponent"
PORT=8095
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTE="${1:-}"

c_green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
c_yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
c_red() { printf "\033[0;31m%s\033[0m\n" "$1"; }

find_booted_udid() {
  xcrun simctl list devices \
    | grep -F "$DEVICE_NAME" \
    | grep "Booted" \
    | head -1 \
    | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true
}

find_any_udid() {
  xcrun simctl list devices \
    | grep -F "$DEVICE_NAME" \
    | head -1 \
    | grep -Eo '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true
}

metro_running() {
  lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo ""
}

# --- status only, no side effects ---
if [[ "$ROUTE" == "status" ]]; then
  UDID="$(find_booted_udid)"
  if [[ -n "$UDID" ]]; then
    c_green "✓ Simülatör açık: $DEVICE_NAME ($UDID)"
  else
    c_red "✗ $DEVICE_NAME açık değil"
  fi
  if metro_running; then
    c_green "✓ Metro çalışıyor (port $PORT)"
  else
    c_red "✗ Metro çalışmıyor (port $PORT)"
  fi
  IP="$(lan_ip)"
  [[ -n "$IP" ]] && echo "LAN IP: $IP  →  exp://$IP:$PORT"
  exit 0
fi

# --- 1) simülatörü ayağa kaldır ---
UDID="$(find_booted_udid)"
if [[ -z "$UDID" ]]; then
  c_yellow "Açık $DEVICE_NAME bulunamadı, boot ediliyor…"
  UDID="$(find_any_udid)"
  if [[ -z "$UDID" ]]; then
    c_red "Hata: '$DEVICE_NAME' adında bir simülatör bulunamadı. Xcode > Settings > Platforms'tan kontrol et."
    exit 1
  fi
  xcrun simctl boot "$UDID"
  open -a Simulator
  sleep 3
fi
c_green "✓ Simülatör: $DEVICE_NAME ($UDID)"

# --- 2) Metro'yu ayağa kaldır ---
if ! metro_running; then
  c_yellow "Metro (port $PORT) çalışmıyor, başlatılıyor…"
  (cd "$PROJECT_DIR" && nohup npx expo start --port "$PORT" > /tmp/gymentra-metro.log 2>&1 &)
  for i in $(seq 1 30); do
    metro_running && break
    sleep 1
  done
  if ! metro_running; then
    c_red "Metro $((30))sn içinde açılmadı. Log: /tmp/gymentra-metro.log"
    exit 1
  fi
  sleep 2
fi
c_green "✓ Metro çalışıyor (port $PORT)"

# --- 3) Expo Go'yu öne getir ---
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
sleep 1

# --- 4) route verildiyse deep-link at ---
if [[ -n "$ROUTE" ]]; then
  IP="$(lan_ip)"
  if [[ -z "$IP" ]]; then
    c_red "LAN IP bulunamadı, deep-link atılamıyor. Expo Go'yu elle aç."
    exit 1
  fi
  ROUTE="${ROUTE#/}"
  URL="exp://$IP:$PORT/--/$ROUTE"
  c_yellow "Deep-link: $URL"
  xcrun simctl openurl "$UDID" "$URL"
  c_green "✓ /$ROUTE ekranına yönlendirildi"
else
  c_green "✓ Expo Go açıldı (kayıtlı son ekranda kalır)"
fi
