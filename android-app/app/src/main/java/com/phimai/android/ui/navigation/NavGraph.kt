package com.phimai.android.ui.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.phimai.android.ui.screens.channels.ChannelDetailScreen
import com.phimai.android.ui.screens.channels.ChannelsDirectoryScreen
import com.phimai.android.ui.screens.home.HomeScreen
import com.phimai.android.ui.screens.hot.HotScreen
import com.phimai.android.ui.screens.library.LibraryScreen
import com.phimai.android.ui.screens.settings.SettingsScreen
import com.phimai.android.ui.screens.watch.WatchScreen

@Composable
fun PhimAiNavGraph(navController: NavHostController) {
    val openFilm: (String) -> Unit = { id ->
        navController.navigate(Screen.Watch.createRoute(id))
    }
    val openChannel: (String) -> Unit = { name ->
        navController.navigate(Screen.ChannelDetail.createRoute(name))
    }

    NavHost(
        navController = navController,
        startDestination = Screen.Home.route
    ) {
        composable(Screen.Home.route) {
            HomeScreen(
                onFilmClick = openFilm,
                onChannelClick = openChannel
            )
        }
        composable(Screen.Channels.route) {
            ChannelsDirectoryScreen(
                onChannelClick = openChannel,
                onFilmClick = openFilm
            )
        }
        composable(Screen.Hot.route) {
            HotScreen(
                onFilmClick = openFilm,
                onChannelClick = openChannel
            )
        }
        composable(Screen.Library.route) {
            LibraryScreen(
                onFilmClick = openFilm,
                onChannelClick = openChannel
            )
        }
        composable(Screen.Settings.route) {
            SettingsScreen()
        }
        composable(
            route = Screen.ChannelDetail.route,
            arguments = listOf(navArgument("channelName") { type = NavType.StringType })
        ) { entry ->
            val raw = entry.arguments?.getString("channelName").orEmpty()
            val decoded = runCatching { Uri.decode(raw) }.getOrDefault(raw)
            ChannelDetailScreen(
                channelName = decoded,
                onBack = { navController.popBackStack() },
                onFilmClick = openFilm
            )
        }
        composable(
            route = Screen.Watch.route,
            arguments = listOf(navArgument("filmId") { type = NavType.StringType })
        ) { entry ->
            val raw = entry.arguments?.getString("filmId").orEmpty()
            val decoded = runCatching { Uri.decode(raw) }.getOrDefault(raw)
            WatchScreen(
                filmId = decoded,
                navController = navController
            )
        }
    }
}
