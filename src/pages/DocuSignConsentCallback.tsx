import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Landing page after DocuSign JWT consent.
 * DocuSign redirects here with ?code=...; consent is already granted when user clicked Allow.
 * This route exists so we don't 404. No need to exchange the code for JWT use.
 */
const DocuSignConsentCallback = () => {
  const [redirectCount, setRedirectCount] = useState(8);
  const navigate = useNavigate();

  useEffect(() => {
    if (redirectCount <= 0) {
      navigate("/portal", { replace: true });
      return;
    }
    const t = setInterval(() => setRedirectCount((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [redirectCount, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          DocuSign consent granted
        </h1>
        <p className="mb-4 text-sm text-gray-600">
          JWT consent was recorded. You can close this tab or use the links below.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            to="/portal"
            className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Student Portal
          </Link>
          <Link
            to="/admin"
            className="rounded-md border border-input bg-background px-4 py-2 text-center text-sm font-medium hover:bg-accent"
          >
            Go to Admin
          </Link>
          <Link
            to="/"
            className="rounded-md px-4 py-2 text-center text-sm text-muted-foreground hover:underline"
          >
            Home
          </Link>
        </div>
        {redirectCount > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Redirecting to Student Portal in {redirectCount}s…
          </p>
        )}
      </div>
    </div>
  );
};

export default DocuSignConsentCallback;
