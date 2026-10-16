import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteProvider } from './SiteProvider';
import { AuthProvider } from './AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { PublicLayout } from '@/components/site/PublicLayout';
import { PageLoader } from '@/components/ui/States';
import { ApiError } from '@/lib/api';

const HomePage = lazy(() => import('@/pages/HomePage'));
const CmsPage = lazy(() => import('@/pages/CmsPage'));
const RoomDetailPage = lazy(() => import('@/pages/RoomDetailPage'));
const BookPage = lazy(() => import('@/pages/book/BookPage'));
const BookingPage = lazy(() => import('@/pages/BookingPage'));
const ManageBookingPage = lazy(() => import('@/pages/ManageBookingPage'));
const OfferPage = lazy(() => import('@/pages/OfferPage'));
const JournalPostPage = lazy(() => import('@/pages/JournalPostPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const AuthPage = lazy(() => import('@/pages/account/AuthPage'));
const ResetPasswordPage = lazy(() => import('@/pages/account/ResetPasswordPage'));
const UnsubscribePage = lazy(() => import('@/pages/UnsubscribePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdminApp = lazy(() => import('@/admin/AdminApp'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/admin/*" element={<AdminApp />} />
                <Route element={<SiteProvider><PublicLayout /></SiteProvider>}>
                  <Route index element={<HomePage />} />
                  <Route path="rooms/:slug" element={<RoomDetailPage />} />
                  <Route path="book" element={<BookPage />} />
                  <Route path="booking/:reference" element={<BookingPage />} />
                  <Route path="manage-booking" element={<ManageBookingPage />} />
                  <Route path="offers/:slug" element={<OfferPage />} />
                  <Route path="journal/:slug" element={<JournalPostPage />} />
                  <Route path="account" element={<AccountPage />} />
                  <Route path="login" element={<AuthPage mode="login" />} />
                  <Route path="register" element={<AuthPage mode="register" />} />
                  <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
                  <Route path="reset-password" element={<ResetPasswordPage />} />
                  <Route path="unsubscribe" element={<UnsubscribePage />} />
                  <Route path=":slug" element={<CmsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
