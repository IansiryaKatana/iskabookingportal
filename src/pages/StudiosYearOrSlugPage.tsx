import { lazy } from "react";
import { useParams } from "react-router-dom";

const StudiosCatalog = lazy(() => import("./StudiosCatalog"));
const StudioGradePage = lazy(() => import("./StudioGrade"));

const ACADEMIC_YEAR_PATH = /^\d{4}-\d{4}$/;

/**
 * Disambiguates `/studios/:segment` between academic-year catalog URLs
 * (e.g. `/studios/2026-2027`) and legacy studio-grade slug URLs
 * (e.g. `/studios/silver`).
 */
const StudiosYearOrSlugPage = () => {
  const { yearOrSlug } = useParams<{ yearOrSlug: string }>();

  if (ACADEMIC_YEAR_PATH.test(yearOrSlug ?? "")) {
    return <StudiosCatalog />;
  }

  return <StudioGradePage />;
};

export default StudiosYearOrSlugPage;
