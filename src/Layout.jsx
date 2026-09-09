import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Activity, MessageCircle, BarChart3, Settings, Zap, Trophy, Loader2, TrendingUp, Menu, X } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { User } from "@/entities/User";
import { Activity as ActivityEntity } from "@/entities/Activity";
import { UnitsProvider, useUnits } from "@/components/units/UnitsProvider";

const navigationItems = [
  { title: "Coach Chat", url: createPageUrl("Chat"), icon: MessageCircle },
  { title: "Activities", url: createPageUrl("Activities"), icon: Activity },
  { title: "Best Efforts", url: createPageUrl("BestEfforts"), icon: Trophy },
  { title: "Analytics", url: createPageUrl("Analytics"), icon: BarChart3 },
  { title: "Performance", url: "/PerformanceTrends", icon: TrendingUp },
  { title: "Settings", url: createPageUrl("Settings"), icon: Settings },
  { title: "Training Plan", url: createPageUrl("TrainingPlan"), icon: Zap },
];

// Bottom 5 items shown in mobile nav bar
const mobileNavItems = navigationItems.slice(0, 5);

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const { formatDistance } = useUnits();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [quickStats, setQuickStats] = useState({ weekDistance: "0.0", weekActivities: 0, avgPace: "N/A" });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await User.me();
        setCurrentUser(me);
        if (me?.strava_access_token && me?.strava_athlete_id) {
          setIsLoadingStats(true);
          try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const activities = await ActivityEntity.filter({ athlete_id: me.strava_athlete_id }, '-start_date', 50);
            if (activities && activities.length > 0) {
              const weekActivities = activities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
              const totalDistance = weekActivities.reduce((sum, a) => sum + (a.distance_m || 0), 0);
              const runs = weekActivities.filter(a => a.type === 'Run' && a.average_speed_mps > 0);
              const avgPaceMinutesPerMile = runs.length > 0
                ? runs.reduce((sum, run) => {
                    const mph = (run.average_speed_mps * 3600) / 1609.34;
                    return mph === 0 ? sum : sum + 60 / mph;
                  }, 0) / runs.length
                : null;
              setQuickStats({
                weekDistance: formatDistance(totalDistance),
                weekActivities: weekActivities.length,
                avgPace: avgPaceMinutesPerMile
                  ? `${Math.floor(avgPaceMinutesPerMile)}:${String(Math.round((avgPaceMinutesPerMile % 1) * 60)).padStart(2, '0')}`
                  : 'N/A'
              });
            } else {
              setQuickStats({ weekDistance: formatDistance(0), weekActivities: 0, avgPace: 'N/A' });
            }
          } catch {
            setQuickStats({ weekDistance: "—", weekActivities: "—", avgPace: "—" });
          } finally {
            setIsLoadingStats(false);
          }
        }
      } catch {
        setCurrentUser(null);
      }
    })();
  }, [formatDistance]);

  const handleLogout = async () => { await User.logout(); };

  const getInitials = (nameOrEmail) => {
    if (!nameOrEmail) return "U";
    const parts = String(nameOrEmail).trim().split(" ");
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    const single = parts[0];
    if (single.includes("@")) return single[0].toUpperCase();
    return single.slice(0, 2).toUpperCase();
  };

  const displayName = currentUser?.full_name || currentUser?.email || "Guest";
  const initials = getInitials(currentUser?.full_name || currentUser?.email);
  const stravaStatus = currentUser?.strava_access_token ? "Connected to Strava" : "Not connected";

  return (
    <>
      {/* ── DESKTOP LAYOUT (md+) ── */}
      <SidebarProvider>
        <div className="hidden md:flex min-h-screen w-full bg-gray-50">
          <Sidebar className="border-r border-gray-200">
            <SidebarHeader className="border-b border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">Strava Coach</h2>
                  <p className="text-xs text-gray-500">AI Training Assistant</p>
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent className="p-2">
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2">
                  Navigation
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigationItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-orange-50 hover:text-orange-700 transition-colors duration-200 rounded-lg mb-1 ${
                            location.pathname === item.url ? 'bg-orange-50 text-orange-700' : ''
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                            <item.icon className="w-4 h-4" />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              {currentUser?.strava_access_token && (
                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2">
                    This Week
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    {isLoadingStats ? (
                      <div className="px-3 py-4 text-center">
                        <Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-400" />
                      </div>
                    ) : (
                      <div className="px-3 py-2 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Distance</span>
                          <span className="font-semibold text-orange-600">{quickStats.weekDistance}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Activities</span>
                          <span className="font-semibold">{quickStats.weekActivities}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Avg Pace</span>
                          <span className="font-semibold">{quickStats.avgPace}</span>
                        </div>
                      </div>
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>
            <SidebarFooter className="border-t border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-orange-600 font-medium text-sm">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{stravaStatus}</p>
                </div>
              </div>
              <div className="mt-3">
                <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>Log out</Button>
              </div>
            </SidebarFooter>
          </Sidebar>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </SidebarProvider>

      {/* ── MOBILE LAYOUT (< md) ── */}
      <div className="flex flex-col md:hidden" style={{ height: '100dvh' }}>
        {/* Top bar */}
        <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-40">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-semibold">Strava Coach</h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>

        {/* Bottom nav bar — always visible */}
        <nav className="shrink-0 bg-white border-t border-gray-200 flex z-40">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors ${
                  isActive ? 'text-orange-600' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-orange-600' : ''}`} />
                <span className="leading-tight text-center" style={{ fontSize: '10px' }}>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── MOBILE FULL-SCREEN MENU OVERLAY ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-semibold">Strava Coach</h1>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-1">
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <Link
                    key={item.title}
                    to={item.url}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-orange-50 text-orange-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-orange-600 font-medium text-sm">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{stravaStatus}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>Log out</Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <UnitsProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
    </UnitsProvider>
  );
}