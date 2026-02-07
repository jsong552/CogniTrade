import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Activity, FileText, Brain, Settings } from 'lucide-react';
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/trade', icon: Activity, label: 'Trade' },
  { to: '/logs', icon: FileText, label: 'Logs' },
  { to: '/analysis', icon: Brain, label: 'Analysis' },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-56 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="hidden md:block text-sm font-bold tracking-tight">PaperTrader</span>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 w-0.5 h-5 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden md:block">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-2 border-t border-border">
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:block">Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4 md:p-6 max-w-7xl mx-auto"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
