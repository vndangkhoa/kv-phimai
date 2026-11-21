package com.phimai.android.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SavedFilmEntity
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.local.SubscribedChannelEntity
import com.phimai.android.data.local.WatchHistoryEntity
import com.phimai.android.data.model.Film
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.data.util.PhimAiUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    settings: SettingsDataStore
) : ViewModel() {

    val serverUrl = settings.serverUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        PhimAiUtils.DEFAULT_SERVER_URL
    )
    val savedFilms = repo.observeSavedFilms().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList<SavedFilmEntity>()
    )
    val history = repo.observeHistory().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList<WatchHistoryEntity>()
    )
    val subscriptions = repo.observeSubscriptions().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList<SubscribedChannelEntity>()
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

    fun toggleSave(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }

    fun unsubscribe(channelName: String) {
        viewModelScope.launch { repo.toggleSubscription(channelName) }
    }

    fun clearHistory() {
        viewModelScope.launch { repo.clearHistory() }
    }
}
