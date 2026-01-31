import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import PageTitle from "./components/PageTitle";
import FaviconUpdater from "./components/FaviconUpdater";
import MetaTagsUpdater from "./components/MetaTagsUpdater";
import Preloader from "./components/Preloader";
import ScrollProgress from "./components/ScrollProgress";
import GoogleAnalytics from "./components/GoogleAnalytics";
import WebsiteAnalyticsTracker from "./components/WebsiteAnalyticsTracker";
import NewsletterPopup from "./components/NewsletterPopup";
import FloatingActions from "./components/FloatingActions";
import AnimatedRoutes from "./components/AnimatedRoutes";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Preloader />
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <ErrorBoundary>
              <PageTitle />
              <FaviconUpdater />
              <MetaTagsUpdater />
              <GoogleAnalytics />
              <WebsiteAnalyticsTracker />
              <ScrollProgress />
              <AnimatedRoutes />
              <NewsletterPopup />
              <FloatingActions />
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
