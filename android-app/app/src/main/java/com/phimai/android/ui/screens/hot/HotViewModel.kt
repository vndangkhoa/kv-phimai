package com.phimai.android.ui.screens.hot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.Film
import com.phimai.android.data.model.TopWeekEntry
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.data.util.PhimAiUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HotUiState(
    val isLoading: Boolean = true,
    val topWeek: List<TopWeekEntry> = emptyList(),
    val hotFilms: List<Film> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class HotViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    settings: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(HotUiState())
    val uiState: StateFlow<HotUiState> = _uiState.asStateFlow()

    val serverUrl = settings.serverUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        PhimAiUtils.DEFAULT_SERVER_URL
    )
    val savedIds = repo.observeSavedIds().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptySet()
    )
    val progressMap = repo.observeProgressMap().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyMap()
    )

    init {
        viewModelScope.launch {
            settings.serverUrl.collectLatest { refresh() }
        }
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            runCatching {
                val top = runCatching { repo.getTopWeek() }.getOrDefault(emptyList())
                val hot = repo.getFilms(sort = "hot", page = 1, limit = 48).items
                top to PhimAiUtils.stackSeriesForGrid(hot)
            }.onSuccess { (top, hot) ->
                _uiState.value = HotUiState(
                    isLoading = false,
                    topWeek = top,
                    hotFilms = hot
                )
            }.onFailure { err ->
                _uiState.value = HotUiState(
                    isLoading = false,
                    error = err.message ?: "Không tải được bảng xếp hạng"
                )
            }
        }
    }

    fun toggleSave(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }
}
