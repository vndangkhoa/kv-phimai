package com.phimai.android.ui.navigation

import android.net.Uri
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Channels : Screen("channels")
    data object Hot : Screen("hot")
    data object Library : Screen("library")
    data object Settings : Screen("settings")

    data object ChannelDetail : Screen("channel/{channelName}") {
        fun createRoute(channelName: String): String =
            "channel/${Uri.encode(channelName)}"
    }

    data object Watch : Screen("watch/{filmId}") {
        fun createRoute(filmId: String): String =
            "watch/${Uri.encode(filmId)}"
    }
}

object TabReselect {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val events = _events.asSharedFlow()

    fun notify(route: String) {
        _events.tryEmit(route)
    }
}
