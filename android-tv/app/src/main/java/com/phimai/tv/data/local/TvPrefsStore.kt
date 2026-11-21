package com.phimai.tv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.model.TvHistoryEntry
import com.phimai.tv.data.util.TvPhimAiUtils
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.tvDataStore: DataStore<Preferences> by preferencesDataStore(name = "phimai_tv_prefs")

class TvPrefsStore private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: TvPrefsStore? = null

        fun getInstance(context: Context): TvPrefsStore =
            instance ?: synchronized(this) {
                instance ?: TvPrefsStore(context.applicationContext).also { instance = it }
            }

        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_QUALITY_CAP = intPreferencesKey("quality_cap")
        private val KEY_AUTO_PLAY_NEXT = booleanPreferencesKey("auto_play_next")
        private val KEY_HISTORY = stringPreferencesKey("watch_history")
        private val KEY_SAVED = stringPreferencesKey("saved_films")
        private val KEY_SUBS = stringPreferencesKey("subscribed_channels")
    }

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    val serverUrlFlow: Flow<String> = context.tvDataStore.data.map { prefs ->
        TvPhimAiUtils.normalizeServerUrl(prefs[KEY_SERVER_URL])
    }

    val qualityCapFlow: Flow<Int> = context.tvDataStore.data.map { prefs ->
        prefs[KEY_QUALITY_CAP] ?: 0
    }

    val autoPlayNextFlow: Flow<Boolean> = context.tvDataStore.data.map { prefs ->
        prefs[KEY_AUTO_PLAY_NEXT] ?: true
    }

    val historyFlow: Flow<List<TvHistoryEntry>> = context.tvDataStore.data.map { prefs ->
        runCatching { json.decodeFromString<List<TvHistoryEntry>>(prefs[KEY_HISTORY] ?: "[]") }
            .getOrDefault(emptyList())
    }

    val savedFlow: Flow<List<TvFilm>> = context.tvDataStore.data.map { prefs ->
        runCatching { json.decodeFromString<List<TvFilm>>(prefs[KEY_SAVED] ?: "[]") }
            .getOrDefault(emptyList())
    }

    val subscribedChannelsFlow: Flow<List<String>> = context.tvDataStore.data.map { prefs ->
        runCatching { json.decodeFromString<List<String>>(prefs[KEY_SUBS] ?: "[]") }
            .getOrDefault(emptyList())
    }

    suspend fun getServerUrl(): String = serverUrlFlow.first()

    suspend fun setServerUrl(url: String) {
        val norm = TvPhimAiUtils.normalizeServerUrl(url)
        context.tvDataStore.edit { it[KEY_SERVER_URL] = norm }
    }

    suspend fun setQualityCap(cap: Int) {
        context.tvDataStore.edit { it[KEY_QUALITY_CAP] = cap }
    }

    suspend fun setAutoPlayNext(enabled: Boolean) {
        context.tvDataStore.edit { it[KEY_AUTO_PLAY_NEXT] = enabled }
    }

    suspend fun getSavedPositionMs(filmId: String): Long {
        val entry = historyFlow.first().firstOrNull { it.film.id == filmId } ?: return 0L
        if (entry.durationMs > 0L && entry.positionMs > entry.durationMs - 15_000L) return 0L
        return entry.positionMs
    }

    suspend fun recordWatchStart(film: TvFilm) {
        context.tvDataStore.edit { prefs ->
            val current = runCatching {
                json.decodeFromString<List<TvHistoryEntry>>(prefs[KEY_HISTORY] ?: "[]")
            }.getOrDefault(emptyList()).toMutableList()
            val prevPos = current.firstOrNull { it.film.id == film.id }?.positionMs ?: 0L
            val prevDur = current.firstOrNull { it.film.id == film.id }?.durationMs ?: 0L
            current.removeAll { it.film.id == film.id }
            current.add(0, TvHistoryEntry(film, prevPos, prevDur, System.currentTimeMillis()))
            prefs[KEY_HISTORY] = json.encodeToString(current.take(60))
        }
    }

    suspend fun updateProgress(filmId: String, posMs: Long, durMs: Long) {
        if (filmId.isBlank() || posMs < 0L) return
        context.tvDataStore.edit { prefs ->
            val current = runCatching {
                json.decodeFromString<List<TvHistoryEntry>>(prefs[KEY_HISTORY] ?: "[]")
            }.getOrDefault(emptyList()).toMutableList()
            val idx = current.indexOfFirst { it.film.id == filmId }
            if (idx >= 0) {
                current[idx] = current[idx].copy(
                    positionMs = posMs,
                    durationMs = durMs.coerceAtLeast(0L),
                    watchedAt = System.currentTimeMillis()
                )
                prefs[KEY_HISTORY] = json.encodeToString(current)
            }
        }
    }

    suspend fun clearHistory() {
        context.tvDataStore.edit { it.remove(KEY_HISTORY) }
    }

    suspend fun toggleSave(film: TvFilm): Boolean {
        var added = false
        context.tvDataStore.edit { prefs ->
            val list = runCatching {
                json.decodeFromString<List<TvFilm>>(prefs[KEY_SAVED] ?: "[]")
            }.getOrDefault(emptyList()).toMutableList()
            if (list.any { it.id == film.id }) {
                list.removeAll { it.id == film.id }
                added = false
            } else {
                list.add(0, film)
                added = true
            }
            prefs[KEY_SAVED] = json.encodeToString(list.take(100))
        }
        return added
    }

    suspend fun toggleSubscription(channelName: String): Boolean {
        if (channelName.isBlank()) return false
        var added = false
        context.tvDataStore.edit { prefs ->
            val list = runCatching {
                json.decodeFromString<List<String>>(prefs[KEY_SUBS] ?: "[]")
            }.getOrDefault(emptyList()).toMutableList()
            if (list.any { it.equals(channelName, ignoreCase = true) }) {
                list.removeAll { it.equals(channelName, ignoreCase = true) }
                added = false
            } else {
                list.add(0, channelName)
                added = true
            }
            prefs[KEY_SUBS] = json.encodeToString(list)
        }
        return added
    }
}
