import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudents } from "@/hooks/useStudents";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { Search, ExternalLink, Calendar, Building2, PoundSterling, User } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatContractDuration } from "@/utils/contractDuration";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ITEMS_PER_PAGE = 20;

const Students = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: academicYears } = useAdminAcademicYears();
  const { data: studioGradesData } = useAdminStudioGrades();
  const studioGrades = studioGradesData?.grades ?? [];

  const filters = useMemo(() => {
    const f: {
      search?: string;
      academicYearId?: string;
      studioGradeId?: string;
      status?: string;
    } = {};

    if (search.trim()) {
      f.search = search.trim();
    }
    if (academicYearFilter !== "all") {
      f.academicYearId = academicYearFilter;
    }
    if (gradeFilter !== "all") {
      f.studioGradeId = gradeFilter;
    }
    if (statusFilter !== "all") {
      f.status = statusFilter;
    }

    return f;
  }, [search, academicYearFilter, gradeFilter, statusFilter]);

  const { data: students, isLoading } = useStudents(filters);

  // Paginate students
  const totalPages = students ? Math.ceil(students.length / ITEMS_PER_PAGE) : 0;
  const paginatedStudents = useMemo(() => {
    if (!students) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return students.slice(startIndex, endIndex);
  }, [students, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, academicYearFilter, gradeFilter, statusFilter]);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDateSafe = (value: string | Date | null | undefined) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return format(date, "d MMM yyyy");
  };

  const StudentsSkeleton = () => (
    <>
      {/* Mobile Card Skeletons */}
      <div className="lg:hidden space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="rounded-3xl">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table Skeleton */}
      <Card className="hidden lg:block rounded-3xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Contract</TableHead>
                <TableHead className="font-semibold">Grade</TableHead>
                <TableHead className="font-semibold">Start</TableHead>
                <TableHead className="font-semibold">Total</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );

  return (
    <AdminLayout
      pageTitle="Students"
      subtitle="View and manage all confirmed student bookings"
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Name, email, or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="academic-year">Academic Year</Label>
                <Select value={academicYearFilter} onValueChange={setAcademicYearFilter}>
                  <SelectTrigger id="academic-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {academicYears?.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="studio-grade">Studio Grade</Label>
                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger id="studio-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {studioGrades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <StudentsSkeleton />
        ) : students && students.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, students.length)} of {students.length} student{students.length !== 1 ? "s" : ""}
              </p>
            </div>
            
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {paginatedStudents.map((student) => {
                const fullName = student.profile?.first_name && student.profile?.last_name
                  ? `${student.profile.first_name} ${student.profile.last_name}`
                  : student.profile?.first_name || student.profile?.last_name || "—";
                const contractName = student.contract?.studio_grade?.name || "—";
                const durationLabel = formatContractDuration(student.contract);
                const startDate = formatDateSafe(student.contract?.contract_start);
                const totalValue = formatCurrency(student.total_contract_value);

                return (
                  <Card key={student.id} className="rounded-3xl border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      {/* Header with Name and View Button */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <h3 className="font-semibold text-base truncate">
                              {fullName}
                            </h3>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-md uppercase tracking-wide gap-1.5 h-8 px-3 text-xs flex-shrink-0"
                          onClick={() => navigate(`/admin/students/${student.id}`)}
                        >
                          View
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Contract Details */}
                      <div className="space-y-2 pt-2 border-t border-border/60">
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-muted-foreground">Contract: </span>
                            <span className="font-medium">{contractName} Studio</span>
                            <span className="text-muted-foreground"> · {durationLabel}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs font-normal">
                            {contractName}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-muted-foreground">Start: </span>
                            <span className="font-medium">{startDate}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm pt-1">
                          <PoundSterling className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-muted-foreground">Total: </span>
                            <span className="font-semibold text-base">{totalValue}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <Card className="hidden lg:block rounded-3xl">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">Contract</TableHead>
                      <TableHead className="font-semibold">Grade</TableHead>
                      <TableHead className="font-semibold">Start</TableHead>
                      <TableHead className="font-semibold">Total</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedStudents.map((student) => (
                      <TableRow key={student.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          {student.profile?.first_name && student.profile?.last_name
                            ? `${student.profile.first_name} ${student.profile.last_name}`
                            : student.profile?.first_name || student.profile?.last_name || "—"}
                        </TableCell>
                        <TableCell>
                          {student.contract?.studio_grade?.name || "—"} Studio · {formatContractDuration(student.contract)}
                        </TableCell>
                        <TableCell>
                          {student.contract?.studio_grade?.name || "—"}
                        </TableCell>
                        <TableCell>
                          {formatDateSafe(student.contract?.contract_start)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(student.total_contract_value)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-md uppercase tracking-wide gap-2"
                            onClick={() => navigate(`/admin/students/${student.id}`)}
                          >
                            View
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Pagination */}
            {students && students.length > ITEMS_PER_PAGE && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, students.length)} of {students.length} student{students.length !== 1 ? "s" : ""}
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Students Found
              </CardTitle>
              <CardDescription>
                {search || academicYearFilter !== "all" || gradeFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No confirmed student bookings yet."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default Students;

