package com.phimai.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.util.PhimAiUtils
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "phimai_settings")

@Singleton
class SettingsDataStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_QUALITY_TIER = stringPreferencesKey("quality_tier")
        private val KEY_AUTO_PLAY_NEXT = booleanPreferencesKey("auto_play_next")
        private val KEY_STACK_SERIES = booleanPreferencesKey("stack_series")
        private val KEY_AUTHOR_NAME = stringPreferencesKey("author_name")
    }

    val serverUrl: Flow<String> = context.dataStore.data.map { prefs ->
        PhimAiUtils.normalizeServerUrl(prefs[KEY_SERVER_URL])
    }

    val defaultQuality: Flow<QualityTier> = context.dataStore.data.map { prefs ->
        QualityTier.fromStored(prefs[KEY_QUALITY_TIER])
    }

    val autoPlayNextEpisode: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_AUTO_PLAY_NEXT] ?: true
    }

    val stackSeriesInGrid: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_STACK_SERIES] ?: true
    }

    val authorName: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_AUTHOR_NAME] ?: ""
    }

    suspend fun getServerUrl(): String = serverUrl.first()

    suspend fun setServerUrl(url: String) {
        val normalized = PhimAiUtils.normalizeServerUrl(url)
        context.dataStore.edit { it[KEY_SERVER_URL] = normalized }
    }

    suspend fun setDefaultQuality(tier: QualityTier) {
        context.dataStore.edit { it[KEY_QUALITY_TIER] = tier.name }
    }

    suspend fun setAutoPlayNextEpisode(enabled: Boolean) {
        context.dataStore.edit { it[KEY_AUTO_PLAY_NEXT] = enabled }
    }

    suspend fun setStackSeriesInGrid(enabled: Boolean) {
        context.dataStore.edit { it[KEY_STACK_SERIES] = enabled }
    }

    suspend fun setAuthorName(name: String) {
        context.dataStore.edit { it[KEY_AUTHOR_NAME] = name.trim().take(40) }
    }
}
