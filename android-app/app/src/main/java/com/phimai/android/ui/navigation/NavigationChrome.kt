package com.phimai.android.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema

data class TopLevelTab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

val topLevelTabs = listOf(
    TopLevelTab(Screen.Home.route, "Trang chủ", Icons.Filled.Home, Icons.Outlined.Home),
    TopLevelTab(Screen.Channels.route, "Kênh", Icons.Filled.Tv, Icons.Outlined.Tv),
    TopLevelTab(Screen.Hot.route, "Thịnh hành", Icons.Filled.LocalFireDepartment, Icons.Outlined.LocalFireDepartment),
    TopLevelTab(Screen.Library.route, "Thư viện", Icons.Filled.Bookmarks, Icons.Outlined.Bookmarks),
    TopLevelTab(Screen.Settings.route, "Cài đặt", Icons.Filled.Settings, Icons.Outlined.Settings)
)

private fun handleNavTabClick(
    navController: NavController,
    route: String,
    currentRoute: String?,
    onTabClick: (String) -> Unit
) {
    onTabClick(route)
    if (currentRoute == route) {
        TabReselect.notify(route)
    } else if (navController.popBackStack(route, inclusive = false)) {
        // popped back to existing tab destination
    } else {
        navController.navigate(route) {
            popUpTo(Screen.Home.route)
            launchSingleTop = true
        }
    }
}

@Composable
private fun NavItemVisual(
    tab: TopLevelTab,
    selected: Boolean,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    val fgColor = if (selected) palette.gold else palette.textSecondary
    val icon = if (selected) tab.selectedIcon else tab.unselectedIcon

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(CinemaRadius.element))
                .background(if (selected) palette.goldMuted else Color.Transparent)
                .padding(horizontal = 12.dp, vertical = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = tab.label,
                tint = fgColor,
                modifier = Modifier.size(22.dp)
            )
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = tab.label,
            color = fgColor,
            fontSize = 10.5.sp,
            lineHeight = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            softWrap = false
        )
    }
}

@Composable
fun BottomNavBar(
    navController: NavController,
    modifier: Modifier = Modifier,
    onTabClick: (String) -> Unit = {}
) {
    val palette = cinema
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(palette.slate)
            .navigationBarsPadding()
    ) {
        HorizontalDivider(thickness = 1.dp, color = palette.border)
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            Row(
                modifier = Modifier
                    .widthIn(max = 600.dp)
                    .fillMaxWidth()
                    .heightIn(min = 58.dp),
                horizontalArrangement = Arrangement.SpaceAround,
                verticalAlignment = Alignment.CenterVertically
            ) {
                topLevelTabs.forEach { tab ->
                    val selected = currentRoute == tab.route ||
                        (tab.route == Screen.Channels.route && currentRoute?.startsWith("channel/") == true)
                    NavItemVisual(
                        tab = tab,
                        selected = selected,
                        modifier = Modifier
                            .weight(1f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                handleNavTabClick(navController, tab.route, currentRoute, onTabClick)
                            }
                            .padding(vertical = 6.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun AppNavigationRail(
    navController: NavController,
    modifier: Modifier = Modifier,
    onTabClick: (String) -> Unit = {}
) {
    val palette = cinema
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Row(modifier = modifier.fillMaxHeight()) {
        NavigationRail(
            modifier = Modifier.width(88.dp),
            containerColor = palette.slate,
            contentColor = palette.ivory,
            windowInsets = WindowInsets.systemBars.only(
                WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom
            )
        ) {
            Spacer(modifier = Modifier.height(14.dp))
            topLevelTabs.forEach { tab ->
                val selected = currentRoute == tab.route ||
                    (tab.route == Screen.Channels.route && currentRoute?.startsWith("channel/") == true)
                NavItemVisual(
                    tab = tab,
                    selected = selected,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 66.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            handleNavTabClick(navController, tab.route, currentRoute, onTabClick)
                        }
                        .padding(vertical = 8.dp)
                )
            }
        }
        VerticalDivider(color = palette.border)
    }
}
