import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  SafeAreaView,
} from 'react-native';

// ─── WMO Weather Code Mapping ────────────────────────────────────────────────
const WEATHER_CODES = {
  0:  { label: 'Cerah',               emoji: '☀️' },
  1:  { label: 'Sebagian Besar Cerah', emoji: '🌤️' },
  2:  { label: 'Berawan Sebagian',     emoji: '⛅' },
  3:  { label: 'Mendung',              emoji: '☁️' },
  45: { label: 'Berkabut',             emoji: '🌫️' },
  48: { label: 'Kabut Beku',           emoji: '🌫️' },
  51: { label: 'Gerimis Ringan',       emoji: '🌦️' },
  53: { label: 'Gerimis Sedang',       emoji: '🌦️' },
  55: { label: 'Gerimis Lebat',        emoji: '🌧️' },
  61: { label: 'Hujan Ringan',         emoji: '🌧️' },
  63: { label: 'Hujan Sedang',         emoji: '🌧️' },
  65: { label: 'Hujan Lebat',          emoji: '🌨️' },
  71: { label: 'Salju Ringan',         emoji: '❄️' },
  73: { label: 'Salju Sedang',         emoji: '❄️' },
  75: { label: 'Salju Lebat',          emoji: '🌨️' },
  80: { label: 'Hujan Lokal',          emoji: '🌦️' },
  81: { label: 'Hujan Deras Lokal',    emoji: '🌧️' },
  82: { label: 'Hujan Sangat Deras',   emoji: '⛈️' },
  95: { label: 'Badai Petir',          emoji: '⛈️' },
  96: { label: 'Badai + Hujan Es',     emoji: '⛈️' },
  99: { label: 'Badai + Hujan Es Lebat', emoji: '🌩️' },
};

function getWeatherInfo(code) {
  return WEATHER_CODES[code] ?? { label: 'Tidak Diketahui', emoji: '🌡️' };
}

// ─── Wind Direction Helper ───────────────────────────────────────────────────
function degreesToCompass(deg) {
  const dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  return dirs[Math.round(deg / 45) % 8];
}

function degreesToArrow(deg) {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return arrows[Math.round(deg / 45) % 8];
}

// ─── Dynamic Theme ───────────────────────────────────────────────────────────
function getTheme(weatherCode, isDay) {
  if (!isDay) {
    return {
      gradientTop: '#0f1729',
      gradientBot: '#1a2744',
      cardBg: 'rgba(255,255,255,0.08)',
      textPrimary: '#e8eaf6',
      textSecondary: '#9fa8da',
      accent: '#7c83fd',
      chipBg: 'rgba(124,131,253,0.2)',
      statusBar: 'light-content',
    };
  }
  if ([95, 96, 99, 82].includes(weatherCode)) {
    return {
      gradientTop: '#263238',
      gradientBot: '#37474f',
      cardBg: 'rgba(255,255,255,0.1)',
      textPrimary: '#eceff1',
      textSecondary: '#b0bec5',
      accent: '#78909c',
      chipBg: 'rgba(120,144,156,0.25)',
      statusBar: 'light-content',
    };
  }
  if ([61, 63, 65, 80, 81].includes(weatherCode)) {
    return {
      gradientTop: '#1565c0',
      gradientBot: '#283593',
      cardBg: 'rgba(255,255,255,0.12)',
      textPrimary: '#e3f2fd',
      textSecondary: '#90caf9',
      accent: '#64b5f6',
      chipBg: 'rgba(100,181,246,0.2)',
      statusBar: 'light-content',
    };
  }
  if ([51, 53, 55, 45, 48].includes(weatherCode)) {
    return {
      gradientTop: '#546e7a',
      gradientBot: '#455a64',
      cardBg: 'rgba(255,255,255,0.1)',
      textPrimary: '#eceff1',
      textSecondary: '#cfd8dc',
      accent: '#b0bec5',
      chipBg: 'rgba(176,190,197,0.2)',
      statusBar: 'light-content',
    };
  }
  // Clear / Partly Cloudy → sunny blue
  return {
    gradientTop: '#0288d1',
    gradientBot: '#01579b',
    cardBg: 'rgba(255,255,255,0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#b3e5fc',
    accent: '#fff176',
    chipBg: 'rgba(255,255,255,0.2)',
    statusBar: 'light-content',
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function App() {
  const [searchInput, setSearchInput]     = useState('');
  const [displayInput, setDisplayInput]   = useState('');
  const [weatherData, setWeatherData]     = useState(null);
  const [status, setStatus]               = useState('idle'); // idle | loading | error | success
  const [errorMsg, setErrorMsg]           = useState('');
  const [history, setHistory]             = useState([]);
  const [refreshKey, setRefreshKey]       = useState(0);

  const debounceTimer = useRef(null);
  const abortRef      = useRef(null);
  const fadeAnim      = useRef(new Animated.Value(0)).current;

  // ── Derived theme from weather state ──
  const theme = weatherData
    ? getTheme(weatherData.current_weather.weathercode, weatherData.current_weather.is_day)
    : getTheme(0, 1);

  // ── Fetch logic ──────────────────────────────────────────────────────────
  const fetchWeather = useCallback(async (cityName) => {
    if (!cityName.trim()) {
      setStatus('idle');
      setWeatherData(null);
      return;
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setStatus('loading');
    setWeatherData(null);
    fadeAnim.setValue(0);

    try {
      // Step 1: Geocoding
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=id`,
        { signal }
      );
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        setErrorMsg(`Kota "${cityName}" tidak ditemukan. Coba nama kota lain.`);
        setStatus('error');
        return;
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // Step 2: Forecast (current + daily min/max)
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current_weather=true` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&timezone=auto`,
        { signal }
      );
      const forecastData = await forecastRes.json();

      const result = {
        ...forecastData,
        cityName: name,
        country,
      };

      setWeatherData(result);
      setStatus('success');

      // Save to history (max 5 unique entries)
      setHistory(prev => {
        const filtered = prev.filter(c => c.toLowerCase() !== name.toLowerCase());
        return [name, ...filtered].slice(0, 5);
      });

      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

    } catch (err) {
      if (err.name === 'AbortError') return; // Request was cancelled — ignore
      setErrorMsg('Gagal mengambil data cuaca. Periksa koneksi internet kamu.');
      setStatus('error');
    }
  }, [fadeAnim]);

  // ── Debounce on searchInput ───────────────────────────────────────────────
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      fetchWeather(searchInput);
    }, 500);

    return () => {
      clearTimeout(debounceTimer.current);
    };
  }, [searchInput, refreshKey]);

  // ── Cleanup abort on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleTextChange = (text) => {
    setDisplayInput(text);
    setSearchInput(text);
  };

  const handleHistoryTap = (city) => {
    setDisplayInput(city);
    setSearchInput(city);
  };

  const handleRefresh = () => {
    if (searchInput.trim()) setRefreshKey(k => k + 1);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const cw   = weatherData?.current_weather;
  const daily = weatherData?.daily;
  const weatherInfo = cw ? getWeatherInfo(cw.weathercode) : null;
  const isNight = cw && cw.is_day === 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.gradientTop }]}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.gradientTop} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ── */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
              {isNight ? '🌙' : '🌤️'} CuacaKu
            </Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              Cari cuaca kota mana saja
            </Text>
          </View>

          {/* ── Search Bar ── */}
          <View style={[styles.searchRow, { backgroundColor: theme.cardBg }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Ketik nama kota..."
              placeholderTextColor={theme.textSecondary}
              value={displayInput}
              onChangeText={handleTextChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {displayInput.length > 0 && (
              <TouchableOpacity onPress={() => handleTextChange('')} style={styles.clearBtn}>
                <Text style={{ color: theme.textSecondary, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── History Chips ── */}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyLabel, { color: theme.textSecondary }]}>
                🕘 Terakhir dicari
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipsRow}>
                  {history.map((city) => (
                    <TouchableOpacity
                      key={city}
                      onPress={() => handleHistoryTap(city)}
                      style={[styles.chip, { backgroundColor: theme.chipBg, borderColor: theme.accent }]}
                    >
                      <Text style={[styles.chipText, { color: theme.textPrimary }]}>{city}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* ── States ── */}

          {/* Idle */}
          {status === 'idle' && (
            <View style={styles.centerBox}>
              <Text style={styles.idleEmoji}>🌍</Text>
              <Text style={[styles.idleText, { color: theme.textSecondary }]}>
                Ketik nama kota untuk melihat cuaca terkini
              </Text>
            </View>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Mencari data cuaca...
              </Text>
            </View>
          )}

          {/* Error */}
          {status === 'error' && (
            <View style={[styles.errorCard, { backgroundColor: 'rgba(229,57,53,0.15)' }]}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Success — Weather Card */}
          {status === 'success' && weatherData && (
            <Animated.View style={{ opacity: fadeAnim }}>

              {/* Main Card */}
              <View style={[styles.weatherCard, { backgroundColor: theme.cardBg }]}>

                {/* City & Country */}
                <View style={styles.cityRow}>
                  <View>
                    <Text style={[styles.cityName, { color: theme.textPrimary }]}>
                      {weatherData.cityName}
                    </Text>
                    <Text style={[styles.countryName, { color: theme.textSecondary }]}>
                      📍 {weatherData.country}
                    </Text>
                  </View>
                  <Text style={styles.dayNightBadge}>
                    {isNight ? '🌙 Malam' : '☀️ Siang'}
                  </Text>
                </View>

                {/* Big Temp */}
                <View style={styles.tempRow}>
                  <Text style={styles.weatherEmoji}>{weatherInfo.emoji}</Text>
                  <Text style={[styles.tempBig, { color: theme.textPrimary }]}>
                    {Math.round(cw.temperature)}°C
                  </Text>
                </View>
                <Text style={[styles.conditionLabel, { color: theme.accent }]}>
                  {weatherInfo.label}
                </Text>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: theme.textSecondary, opacity: 0.3 }]} />

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                  {/* Wind */}
                  <View style={styles.statItem}>
                    <Text style={styles.statEmoji}>💨</Text>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                      {cw.windspeed} km/h
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Angin</Text>
                  </View>

                  {/* Wind Direction */}
                  <View style={styles.statItem}>
                    <Text style={styles.statEmoji}>
                      {degreesToArrow(cw.winddirection)}
                    </Text>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                      {degreesToCompass(cw.winddirection)}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Arah</Text>
                  </View>

                  {/* Min Temp */}
                  <View style={styles.statItem}>
                    <Text style={styles.statEmoji}>🔵</Text>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                      {daily?.temperature_2m_min?.[0] !== undefined
                        ? `${Math.round(daily.temperature_2m_min[0])}°C`
                        : '–'}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Min Hari ini</Text>
                  </View>

                  {/* Max Temp */}
                  <View style={styles.statItem}>
                    <Text style={styles.statEmoji}>🔴</Text>
                    <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                      {daily?.temperature_2m_max?.[0] !== undefined
                        ? `${Math.round(daily.temperature_2m_max[0])}°C`
                        : '–'}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Maks Hari ini</Text>
                  </View>
                </View>

                {/* Refresh Button */}
                <TouchableOpacity
                  style={[styles.refreshBtn, { borderColor: theme.accent }]}
                  onPress={handleRefresh}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.refreshBtnText, { color: theme.accent }]}>
                    🔄  Perbarui Data
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Tomorrow Forecast Preview */}
              {daily && (
                <View style={[styles.tomorrowCard, { backgroundColor: theme.cardBg }]}>
                  <Text style={[styles.tomorrowTitle, { color: theme.textSecondary }]}>
                    📅 Besok
                  </Text>
                  <View style={styles.tomorrowRow}>
                    <Text style={[styles.tomorrowTemp, { color: theme.textPrimary }]}>
                      🔵 {Math.round(daily.temperature_2m_min[1] ?? 0)}°
                    </Text>
                    <Text style={[styles.tomorrowSep, { color: theme.textSecondary }]}>/</Text>
                    <Text style={[styles.tomorrowTemp, { color: theme.textPrimary }]}>
                      🔴 {Math.round(daily.temperature_2m_max[1] ?? 0)}°
                    </Text>
                  </View>
                </View>
              )}

            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 14,
    marginTop: 4,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  clearBtn: {
    padding: 6,
  },

  // History
  historySection: {
    marginBottom: 16,
  },
  historyLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Idle / Loading
  centerBox: {
    alignItems: 'center',
    marginTop: 60,
    gap: 16,
  },
  idleEmoji: {
    fontSize: 64,
  },
  idleText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 12,
  },

  // Error
  errorCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  errorEmoji: {
    fontSize: 36,
  },
  errorText: {
    color: '#ef9a9a',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Weather Card
  weatherCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 12,
  },
  cityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  cityName: {
    fontSize: 26,
    fontWeight: '800',
  },
  countryName: {
    fontSize: 14,
    marginTop: 2,
  },
  dayNightBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weatherEmoji: {
    fontSize: 56,
  },
  tempBig: {
    fontSize: 72,
    fontWeight: '200',
    lineHeight: 80,
  },
  conditionLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    minWidth: '40%',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  statEmoji: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Tomorrow Card
  tomorrowCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tomorrowTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tomorrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tomorrowTemp: {
    fontSize: 18,
    fontWeight: '700',
  },
  tomorrowSep: {
    fontSize: 18,
  },
});