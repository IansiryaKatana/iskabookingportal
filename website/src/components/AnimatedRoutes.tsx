import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { lazy, Suspense } from "react";
import PageTransition from "./PageTransition";
import ProtectedRoute from "./ProtectedRoute";

// Lazy load components
const Index = lazy(() => import("../pages/Index"));
const NotFound = lazy(() => import("../pages/NotFound"));
const StudiosHome = lazy(() => import("../pages/StudiosHome"));
const Contact = lazy(() => import("../pages/Contact"));
const FAQ = lazy(() => import("../pages/FAQ"));
const Blog = lazy(() => import("../pages/Blog"));
const BlogDetail = lazy(() => import("../pages/BlogDetail"));
const About = lazy(() => import("../pages/About"));
const ShortTerm = lazy(() => import("../pages/ShortTerm"));
const Privacy = lazy(() => import("../pages/Privacy"));
const Terms = lazy(() => import("../pages/Terms"));
const Reviews = lazy(() => import("../pages/Reviews"));
const StudioGradeRedirect = lazy(() => import("../pages/StudioGradeRedirect"));
// Admin
const AdminLogin = lazy(() => import("../pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("../pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const FormSubmissions = lazy(() => import("../pages/admin/FormSubmissions"));
const FaqsList = lazy(() => import("../pages/admin/FaqsList"));
const AmenitiesList = lazy(() => import("../pages/admin/AmenitiesList"));
const WhyUsList = lazy(() => import("../pages/admin/WhyUsList"));
const BlogAdmin = lazy(() => import("../pages/admin/BlogAdmin"));
const BlogPostEdit = lazy(() => import("../pages/admin/BlogPostEdit"));
const SeoManagement = lazy(() => import("../pages/admin/SeoManagement"));
const AnalyticsManagement = lazy(() => import("../pages/admin/AnalyticsManagement"));
const ReviewsList = lazy(() => import("../pages/admin/ReviewsList"));
const MediaList = lazy(() => import("../pages/admin/MediaList"));
const NewsletterAdmin = lazy(() => import("../pages/admin/NewsletterAdmin"));

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={null}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition key={location.pathname}><Index /></PageTransition>} />
          <Route path="/studios" element={<PageTransition key={location.pathname}><StudiosHome /></PageTransition>} />
          <Route path="/studios/:year" element={<PageTransition key={location.pathname}><StudiosHome /></PageTransition>} />
          <Route path="/studios/:year/:slug" element={<PageTransition key={location.pathname}><StudioGradeRedirect /></PageTransition>} />
          <Route path="/contact" element={<PageTransition key={location.pathname}><Contact /></PageTransition>} />
          <Route path="/faq" element={<PageTransition key={location.pathname}><FAQ /></PageTransition>} />
          <Route path="/blog" element={<PageTransition key={location.pathname}><Blog /></PageTransition>} />
          <Route path="/about" element={<PageTransition key={location.pathname}><About /></PageTransition>} />
          <Route path="/short-term" element={<PageTransition key={location.pathname}><ShortTerm /></PageTransition>} />
          <Route path="/privacy" element={<PageTransition key={location.pathname}><Privacy /></PageTransition>} />
          <Route path="/terms" element={<PageTransition key={location.pathname}><Terms /></PageTransition>} />
          <Route path="/reviews" element={<PageTransition key={location.pathname}><Reviews /></PageTransition>} />
          {/* Website admin: login (public) */}
          <Route path="/admin/login" element={<PageTransition key={location.pathname}><AdminLogin /></PageTransition>} />
          {/* Website admin: protected layout + pages */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["staff", "superadmin", "admin"]} checkDatabase={false}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="form-submissions" element={<FormSubmissions />} />
            <Route path="faqs" element={<FaqsList />} />
            <Route path="amenities" element={<AmenitiesList />} />
            <Route path="why-us" element={<WhyUsList />} />
            <Route path="blog" element={<BlogAdmin />} />
            <Route path="blog/:id" element={<BlogPostEdit />} />
            <Route path="seo" element={<SeoManagement />} />
            <Route path="analytics" element={<AnalyticsManagement />} />
            <Route path="reviews" element={<ReviewsList />} />
            <Route path="media" element={<MediaList />} />
            <Route path="newsletter" element={<NewsletterAdmin />} />
          </Route>
          {/* Blog detail: siteurl/slug (no /blog/ prefix); must be after other top-level routes */}
          <Route path="/:slug" element={<PageTransition key={location.pathname}><BlogDetail /></PageTransition>} />
          <Route path="*" element={<PageTransition key={location.pathname}><NotFound /></PageTransition>} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
};

export default AnimatedRoutes;
