package com.phimai.tv

import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.phimai.tv.ui.components.PhimAiSideNav
import com.phimai.tv.ui.components.PhimAiTvLoadingScreen
import com.phimai.tv.ui.components.TV_NAV_RAIL_WIDTH
import com.phimai.tv.ui.screens.ChannelDetailScreen
import com.phimai.tv.ui.screens.ChannelsScreen
import com.phimai.tv.ui.screens.DetailScreen
import com.phimai.tv.ui.screens.HomeScreen
import com.phimai.tv.ui.screens.LibraryScreen
import com.phimai.tv.ui.screens.PlayerScreen
import com.phimai.tv.ui.screens.SearchScreen
import com.phimai.tv.ui.screens.SettingsScreen
import com.phimai.tv.ui.screens.TrendingScreen
import com.phimai.tv.ui.theme.PhimAiTvTheme
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.HomeViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            PhimAiTvTheme {
                Box(Modifier.fillMaxSize().background(TvCinema.Obsidian)) {
                    TvShell()
                }
            }
        }
    }
}

@Composable
private fun TvShell() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route?.substringBefore("/")?.substringBefore("?")
    val isPlayer = route == "player"

    val homeVm: HomeViewModel = viewModel()
    val homeState by homeVm.state.collectAsState()
    val isBootLoading = homeState.isLoading && homeState.hero.isEmpty() && homeState.rows.isEmpty()

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .padding(start = if (!isPlayer) TV_NAV_RAIL_WIDTH.dp else 0.dp)
                .background(TvCinema.Obsidian)
        ) {
            NavHost(navController = nav, startDestination = "home") {
                composable("home") {
                    HomeScreen(
                        onFilmClick = { id -> nav.navigate("detail/${Uri.encode(id)}") },
                        vm = homeVm
                    )
                }
                composable("trending") {
                    TrendingScreen(onFilmClick = { id -> nav.navigate("detail/${Uri.encode(id)}") })
                }
                composable("channels") {
                    ChannelsScreen(onChannelClick = { ch -> nav.navigate("channel/${Uri.encode(ch)}") })
                }
                composable("search") {
                    SearchScreen(onFilmClick = { id -> nav.navigate("detail/${Uri.encode(id)}") })
                }
                composable("library") {
                    LibraryScreen(
                        onFilmClick = { id -> nav.navigate("detail/${Uri.encode(id)}") },
                        onChannelClick = { ch -> nav.navigate("channel/${Uri.encode(ch)}") }
                    )
                }
                composable("settings") {
                    SettingsScreen()
                }
                composable(
                    route = "detail/{filmId}",
                    arguments = listOf(navArgument("filmId") { type = NavType.StringType })
                ) { entry ->
                    val raw = entry.arguments?.getString("filmId").orEmpty()
                    val id = runCatching { Uri.decode(raw) }.getOrDefault(raw)
                    DetailScreen(
                        filmId = id,
                        onPlayClick = { fid -> nav.navigate("player/${Uri.encode(fid)}") },
                        onChannelClick = { ch -> nav.navigate("channel/${Uri.encode(ch)}") },
                        onRelatedClick = { fid -> nav.navigate("detail/${Uri.encode(fid)}") }
                    )
                }
                composable(
                    route = "player/{filmId}",
                    arguments = listOf(navArgument("filmId") { type = NavType.StringType })
                ) { entry ->
                    val raw = entry.arguments?.getString("filmId").orEmpty()
                    val id = runCatching { Uri.decode(raw) }.getOrDefault(raw)
                    PlayerScreen(
                        filmId = id,
                        onSwitchFilm = { nextId ->
                            nav.navigate("player/${Uri.encode(nextId)}") {
                                popUpTo("player/{filmId}") { inclusive = true }
                            }
                        },
                        onBack = { nav.popBackStack() }
                    )
                }
                composable(
                    route = "channel/{channelName}",
                    arguments = listOf(navArgument("channelName") { type = NavType.StringType })
                ) { entry ->
                    val raw = entry.arguments?.getString("channelName").orEmpty()
                    val ch = runCatching { Uri.decode(raw) }.getOrDefault(raw)
                    ChannelDetailScreen(
                        channelName = ch,
                        onFilmClick = { fid -> nav.navigate("detail/${Uri.encode(fid)}") }
                    )
                }
            }
        }

        if (!isPlayer) {
            PhimAiSideNav(
                currentRoute = route,
                onNavigate = { target ->
                    if (route != target) {
                        nav.navigate(target) {
                            launchSingleTop = true
                            popUpTo("home") { inclusive = false }
                        }
                    }
                },
                modifier = Modifier.fillMaxHeight()
            )
        }

        PhimAiTvLoadingScreen(isLoading = isBootLoading)
    }
}
