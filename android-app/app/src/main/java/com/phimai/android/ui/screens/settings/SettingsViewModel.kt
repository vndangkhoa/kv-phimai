package com.phimai.android.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.BuildConfig
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.HealthResponse
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.model.UpdateInfo
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.data.update.UpdateManager
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.player.PlaybackManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HealthCheckUiState(
    val checking: Boolean = false,
    val health: HealthResponse? = null,
    val error: String? = null
)

data class UpdateUiState(
    val checking: Boolean = false,
    val downloading: Boolean = false,
    val progress: Float = 0f,
    val update: UpdateInfo? = null,
    val statusMessage: String? = null
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: SettingsDataStore,
    private val repo: PhimAiRepository,
    private val playbackManager: PlaybackManager,
    private val updateManager: UpdateManager
) : ViewModel() {

    val serverUrl = settings.serverUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        PhimAiUtils.DEFAULT_SERVER_URL
    )
    val defaultQuality = settings.defaultQuality.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        QualityTier.AUTO
    )
    val autoPlayNext = settings.autoPlayNextEpisode.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        true
    )
    val stackSeries = settings.stackSeriesInGrid.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        true
    )

    private val _healthState = MutableStateFlow(HealthCheckUiState())
    val healthState: StateFlow<HealthCheckUiState> = _healthState.asStateFlow()

    private val _updateState = MutableStateFlow(UpdateUiState())
    val updateState: StateFlow<UpdateUiState> = _updateState.asStateFlow()

    fun saveServerUrl(raw: String) {
        viewModelScope.launch {
            settings.setServerUrl(raw)
            checkHealth(raw)
        }
    }

    fun checkHealth(overrideUrl: String? = null) {
        _healthState.value = HealthCheckUiState(checking = true)
        viewModelScope.launch {
            runCatching { repo.getHealth(overrideUrl) }
                .onSuccess { _healthState.value = HealthCheckUiState(checking = false, health = it) }
                .onFailure {
                    _healthState.value = HealthCheckUiState(
                        checking = false,
                        error = it.message ?: "Không kết nối được máy chủ"
                    )
                }
        }
    }

    fun setDefaultQuality(tier: QualityTier) {
        viewModelScope.launch {
            settings.setDefaultQuality(tier)
            playbackManager.setQualityTier(tier)
        }
    }

    fun setAutoPlayNext(enabled: Boolean) {
        viewModelScope.launch { settings.setAutoPlayNextEpisode(enabled) }
    }

    fun setStackSeries(enabled: Boolean) {
        viewModelScope.launch { settings.setStackSeriesInGrid(enabled) }
    }

    fun clearHistory() {
        viewModelScope.launch { repo.clearHistory() }
    }

    fun checkUpdate() {
        _updateState.value = UpdateUiState(checking = true)
        viewModelScope.launch {
            val info = updateManager.checkForUpdate(BuildConfig.VERSION_NAME)
            _updateState.value = if (info != null) {
                UpdateUiState(update = info, statusMessage = "Có bản mới ${info.latestVersion}")
            } else {
                UpdateUiState(statusMessage = "Bạn đang dùng phiên bản mới nhất (${BuildConfig.VERSION_NAME})")
            }
        }
    }

    fun downloadAndInstallUpdate(url: String) {
        _updateState.value = _updateState.value.copy(downloading = true, progress = 0f, statusMessage = "Đang tải APK...")
        viewModelScope.launch {
            val apk = updateManager.downloadUpdate(url) { p ->
                _updateState.value = _updateState.value.copy(progress = p)
            }
            if (apk != null) {
                _updateState.value = _updateState.value.copy(downloading = false, statusMessage = "Đang mở trình cài đặt...")
                updateManager.installApk(apk)
            } else {
                _updateState.value = _updateState.value.copy(downloading = false, statusMessage = "Tải bản cập nhật thất bại")
            }
        }
    }
}
