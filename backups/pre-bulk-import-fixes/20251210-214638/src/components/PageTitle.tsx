import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * Component that sets the page title dynamically based on the current route
 */
const PageTitle = () => {
  usePageTitle();
  return null;
};

export default PageTitle;

