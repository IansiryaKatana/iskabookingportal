import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle2, Filter } from "lucide-react";
import { format } from "date-fns";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";

type FullyPaidStudent = {
  application_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  email: string;
  contract_id: string;
  contract_name: string;
  academic_year_id: string;
  academic_year_name: string;
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  payment_status: string;
  last_payment_date: string;
  application_status: string;
  application_created_at: string;
  studio_number: string | null;
  studio_grade_name: string | null;
};

const FullyPaidStudents = () => {
  const [selectedContract, setSelectedContract] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const { data: contracts } = useAdminContracts();
  const { data: academicYears } = useAdminAcademicYears();

  const { data: students, isLoading } = useQuery({
    queryKey: ["fully-paid-students", selectedContract, selectedYear, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_fully_paid_students", {
        p_contract_id: selectedContract !== "all" ? selectedContract : null,
        p_academic_year_id: selectedYear !== "all" ? selectedYear : null,
        p_start_date: startDate && startDate.trim() !== "" ? startDate : null,
        p_end_date: endDate && endDate.trim() !== "" ? endDate : null,
      });

      if (error) throw error;
      return (data || []) as FullyPaidStudent[];
    },
  });

  const exportToCSV = () => {
    if (!students || students.length === 0) return;

    const headers = [
      "Student Name",
      "Email",
      "Contract",
      "Academic Year",
      "Studio Number",
      "Studio Grade",
      "Total Due",
      "Total Paid",
      "Last Payment Date",
      "Application Status",
    ];

    const rows = students.map((student) => [
      `${student.first_name} ${student.last_name}`,
      student.email,
      student.contract_name || "N/A",
      student.academic_year_name || "N/A",
      student.studio_number || "N/A",
      student.studio_grade_name || "N/A",
      student.total_due.toFixed(2),
      student.total_paid.toFixed(2),
      student.last_payment_date
        ? format(new Date(student.last_payment_date), "yyyy-MM-dd")
        : "N/A",
      student.application_status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `fully-paid-students-${format(new Date(), "yyyy-MM-dd")}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalRevenue = students?.reduce((sum, s) => sum + s.total_paid, 0) || 0;

  return (
    <AdminLayout
      pageTitle="Fully Paid Students"
      subtitle="Students who have completed all payments for their contracts"
      mobileActionButton={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full p-2 h-9 w-9 flex-shrink-0"
          onClick={exportToCSV}
          disabled={!students || students.length === 0}
        >
          <Download className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-end">
          <Button
            onClick={exportToCSV}
            disabled={!students || students.length === 0}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-display uppercase tracking-wide">Summary</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-2xl font-bold">{students?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Fully Paid Students
                </p>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  £{totalRevenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="contract">Contract</Label>
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger id="contract">
                    <SelectValue placeholder="All Contracts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    {contracts?.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Academic Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger id="year">
                    <SelectValue placeholder="All Years" />
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

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Students List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide">Fully Paid Students</CardTitle>
            <CardDescription>
              {students?.length || 0} student{students?.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !students || students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No fully paid students found matching your filters.
              </div>
            ) : (
              <div className="space-y-4">
                {students.map((student) => (
                  <div
                    key={student.application_id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-semibold uppercase tracking-wide">
                          {student.first_name} {student.last_name}
                        </h3>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Fully Paid
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span>{student.email}</span>
                        {student.studio_number && (
                          <span className="ml-2">• Studio {student.studio_number}</span>
                        )}
                        {student.studio_grade_name && (
                          <span className="ml-2">• {student.studio_grade_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {student.contract_name} • {student.academic_year_name}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-sm font-semibold">
                        £{student.total_paid.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                      </div>
                      {student.last_payment_date && (
                        <div className="text-xs text-muted-foreground">
                          Paid: {format(new Date(student.last_payment_date), "MMM dd, yyyy")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default FullyPaidStudents;

