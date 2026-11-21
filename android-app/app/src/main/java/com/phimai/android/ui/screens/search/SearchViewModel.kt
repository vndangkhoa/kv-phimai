package com.phimai.android.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.Film
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.data.util.PhimAiUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val isLoading: Boolean = false,
    val hasSearched: Boolean = false,
    val results: List<Film> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    settings: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

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

    private var debounceJob: Job? = null

    fun onQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        debounceJob?.cancel()
        if (query.isBlank()) {
            _uiState.value = SearchUiState(query = query)
            return
        }
        debounceJob = viewModelScope.launch {
            delay(300)
            searchImmediate(query)
        }
    }

    fun searchImmediate(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.searchFilms(q, page = 1, limit = 60) }
                .onSuccess { res ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        hasSearched = true,
                        results = PhimAiUtils.stackSeriesForGrid(res.items),
                        error = null
                    )
                }
                .onFailure { err ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        hasSearched = true,
                        error = err.message ?: "Tìm kiếm thất bại"
                    )
                }
        }
    }

    fun toggleSave(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }
}
