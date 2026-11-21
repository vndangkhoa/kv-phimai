package com.phimai.android.ui.screens.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.ChannelDetailResponse
import com.phimai.android.data.model.ChannelInfo
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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChannelsDirectoryUiState(
    val isLoading: Boolean = true,
    val query: String = "",
    val sort: String = "popular",
    val channels: List<ChannelInfo> = emptyList(),
    val error: String? = null
)

data class ChannelDetailUiState(
    val isLoading: Boolean = true,
    val detail: ChannelDetailResponse? = null,
    val displayFilms: List<Film> = emptyList(),
    val sort: String = "newest",
    val query: String = "",
    val isSubscribed: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ChannelsViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    settings: SettingsDataStore
) : ViewModel() {

    private val _dirState = MutableStateFlow(ChannelsDirectoryUiState())
    val dirState: StateFlow<ChannelsDirectoryUiState> = _dirState.asStateFlow()

    private val _detailState = MutableStateFlow(ChannelDetailUiState())
    val detailState: StateFlow<ChannelDetailUiState> = _detailState.asStateFlow()

    val serverUrl = settings.serverUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        PhimAiUtils.DEFAULT_SERVER_URL
    )
    val subscribedNames = repo.observeSubscribedNames().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptySet()
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

    private var dirSearchJob: Job? = null

    init {
        viewModelScope.launch {
            settings.serverUrl.collectLatest { loadChannels() }
        }
    }

    fun loadChannels() {
        val st = _dirState.value
        _dirState.value = st.copy(isLoading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.getChannels(st.query, st.sort) }
                .onSuccess { list ->
                    _dirState.value = _dirState.value.copy(isLoading = false, channels = list, error = null)
                }
                .onFailure { err ->
                    _dirState.value = _dirState.value.copy(isLoading = false, error = err.message ?: "Lỗi tải kênh")
                }
        }
    }

    fun onDirectoryQueryChange(q: String) {
        _dirState.value = _dirState.value.copy(query = q)
        dirSearchJob?.cancel()
        dirSearchJob = viewModelScope.launch {
            delay(280)
            loadChannels()
        }
    }

    fun selectDirectorySort(sort: String) {
        if (_dirState.value.sort == sort) return
        _dirState.value = _dirState.value.copy(sort = sort)
        loadChannels()
    }

    fun loadChannelDetail(channelName: String, sort: String = _detailState.value.sort, query: String = _detailState.value.query) {
        _detailState.value = _detailState.value.copy(isLoading = true, sort = sort, query = query, error = null)
        viewModelScope.launch {
            runCatching {
                val detail = repo.getChannelDetail(channelName, sort, query)
                val sub = repo.isChannelSubscribed(detail.name.ifBlank { channelName })
                detail to sub
            }.onSuccess { (detail, sub) ->
                _detailState.value = ChannelDetailUiState(
                    isLoading = false,
                    detail = detail,
                    displayFilms = PhimAiUtils.stackSeriesForGrid(detail.films),
                    sort = sort,
                    query = query,
                    isSubscribed = sub
                )
            }.onFailure { err ->
                _detailState.value = _detailState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Không tải được thông tin kênh"
                )
            }
        }
    }

    fun selectDetailSort(channelName: String, sort: String) {
        loadChannelDetail(channelName, sort = sort, query = _detailState.value.query)
    }

    fun toggleChannelSubscription(name: String, thumb: String = "", count: Int = 0) {
        viewModelScope.launch {
            val nowSub = repo.toggleSubscription(name, thumb, count)
            if (_detailState.value.detail?.name.equals(name, ignoreCase = true)) {
                _detailState.value = _detailState.value.copy(isSubscribed = nowSub)
            }
        }
    }

    fun toggleSaveFilm(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }
}
