package com.phimai.android.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.Film
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

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val films: List<Film> = emptyList(),
    val displayFilms: List<Film> = emptyList(),
    val catCounts: Map<String, Int> = emptyMap(),
    val selectedCat: String = "all",
    val selectedSort: String = "random",
    val fullOnly: Boolean = false,
    val page: Int = 1,
    val hasMore: Boolean = false,
    val total: Int = 0,
    val error: String? = null
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

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

    private var stackSeriesEnabled = true

    init {
        viewModelScope.launch {
            settings.stackSeriesInGrid.collectLatest { enabled ->
                stackSeriesEnabled = enabled
                val raw = _uiState.value.films
                _uiState.value = _uiState.value.copy(
                    displayFilms = if (enabled) PhimAiUtils.stackSeriesForGrid(raw) else raw
                )
            }
        }
        viewModelScope.launch {
            settings.serverUrl.collectLatest {
                loadInitial()
            }
        }
    }

    fun loadInitial(refresh: Boolean = false) {
        val st = _uiState.value
        _uiState.value = st.copy(
            isLoading = !refresh && st.films.isEmpty(),
            isRefreshing = refresh,
            error = null,
            page = 1
        )
        viewModelScope.launch {
            runCatching {
                val manifest = runCatching { repo.getManifest() }.getOrNull()
                val res = repo.getFilms(
                    sort = st.selectedSort,
                    cat = st.selectedCat,
                    fullOnly = st.fullOnly,
                    page = 1,
                    limit = 60
                )
                Triple(manifest, res, stackSeriesEnabled)
            }.onSuccess { (manifest, res, stack) ->
                val raw = res.items
                val stacked = if (stack) PhimAiUtils.stackSeriesForGrid(raw) else raw
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    films = raw,
                    displayFilms = stacked,
                    catCounts = manifest?.cats ?: _uiState.value.catCounts,
                    page = 1,
                    hasMore = res.hasMore,
                    total = res.total,
                    error = null
                )
            }.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    error = err.message ?: "Không tải được danh sách phim"
                )
            }
        }
    }

    fun loadMore() {
        val st = _uiState.value
        if (st.isLoading || st.isLoadingMore || !st.hasMore) return
        val nextPage = st.page + 1
        _uiState.value = st.copy(isLoadingMore = true)
        viewModelScope.launch {
            runCatching {
                repo.getFilms(
                    sort = st.selectedSort,
                    cat = st.selectedCat,
                    fullOnly = st.fullOnly,
                    page = nextPage,
                    limit = 60
                )
            }.onSuccess { res ->
                val combined = (st.films + res.items).distinctBy { it.id }
                val stacked = if (stackSeriesEnabled) PhimAiUtils.stackSeriesForGrid(combined) else combined
                _uiState.value = _uiState.value.copy(
                    isLoadingMore = false,
                    films = combined,
                    displayFilms = stacked,
                    page = nextPage,
                    hasMore = res.hasMore,
                    total = res.total
                )
            }.onFailure {
                _uiState.value = _uiState.value.copy(isLoadingMore = false)
            }
        }
    }

    fun selectCategory(cat: String) {
        if (_uiState.value.selectedCat == cat) return
        _uiState.value = _uiState.value.copy(selectedCat = cat, films = emptyList(), displayFilms = emptyList())
        loadInitial()
    }

    fun selectSort(sort: String) {
        if (_uiState.value.selectedSort == sort) return
        _uiState.value = _uiState.value.copy(selectedSort = sort, films = emptyList(), displayFilms = emptyList())
        loadInitial()
    }

    fun toggleFullOnly() {
        _uiState.value = _uiState.value.copy(
            fullOnly = !_uiState.value.fullOnly,
            films = emptyList(),
            displayFilms = emptyList()
        )
        loadInitial()
    }

    fun toggleSave(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }
}
