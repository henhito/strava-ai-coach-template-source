/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Analytics from './pages/Analytics';
import BestEffortDetail from './pages/BestEffortDetail';
import BestEfforts from './pages/BestEfforts';
import Chat from './pages/Chat';
import Home from './pages/Home';
import Settings from './pages/Settings';
import StravaCallback from './pages/StravaCallback';
import TrainingPlan from './pages/TrainingPlan';
import index from './pages/index';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Activities": Activities,
    "ActivityDetail": ActivityDetail,
    "Analytics": Analytics,
    "BestEffortDetail": BestEffortDetail,
    "BestEfforts": BestEfforts,
    "Chat": Chat,
    "Home": Home,
    "Settings": Settings,
    "StravaCallback": StravaCallback,
    "TrainingPlan": TrainingPlan,
    "index": index,
}

export const pagesConfig = {
    mainPage: "Chat",
    Pages: PAGES,
    Layout: __Layout,
};