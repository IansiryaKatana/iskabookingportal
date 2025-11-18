import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCalculateForecast, type ForecastResult } from "@/hooks/useFinancialForecast";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { Loader2, TrendingUp, Users, Building2, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const FinancialForecast = () => {
  const { toast } = useToast();
  const [targetRevenue, setTargetRevenue] = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);

  const { data: academicYears, isLoading: yearsLoading } = useAdminAcademicYears();
  const { data: studioGradesData, isLoading: gradesLoading } = useAdminStudioGrades();
  const calculateForecast = useCalculateForecast();

  const studioGrades = studioGradesData?.grades ?? [];

  const activeAcademicYear = useMemo(() => {
    return academicYears?.find((year) => year.is_active) || academicYears?.[0];
  }, [academicYears]);

  // Set default academic year when loaded
  useEffect(() => {
    if (activeAcademicYear && !academicYearId) {
      setAcademicYearId(activeAcademicYear.id);
    }
  }, [activeAcademicYear, academicYearId]);

  const handleCalculate = async () => {
    if (!targetRevenue || !academicYearId) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please enter target revenue and select an academic year.",
      });
      return;
    }

    const revenue = parseFloat(targetRevenue.replace(/[£,]/g, ""));
    if (isNaN(revenue) || revenue <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid target revenue amount.",
      });
      return;
    }

    try {
      const result = await calculateForecast.mutateAsync({
        targetRevenue: revenue,
        academicYearId,
        includeExistingBookings: includeExisting,
        studioGradeFilter: selectedGrades.length > 0 ? selectedGrades : undefined,
      });
      setForecastResult(result);
      toast({
        title: "Forecast calculated",
        description: "Financial forecast has been generated successfully.",
      });
    } catch (error) {
      console.error("Forecast calculation error:", error);
      toast({
        variant: "destructive",
        title: "Calculation failed",
        description: error instanceof Error ? error.message : "Failed to calculate forecast. Please try again.",
      });
    }
  };

  const handleExportCSV = () => {
    if (!forecastResult) return;

    const headers = [
      "Contract Name",
      "Studio Grade",
      "Weeks",
      "Weekly Price (£)",
      "Total Contract Value (£)",
      "Current Bookings",
      "Students Needed",
      "New Bookings Needed",
      "Revenue Contribution (£)",
    ];

    const rows = forecastResult.breakdown.map((b) => [
      b.contractName,
      b.studioGradeName,
      b.weeks.toString(),
      b.weeklyPrice.toFixed(2),
      b.totalContractValue.toFixed(2),
      b.currentBookings.toString(),
      b.studentsNeeded.toString(),
      b.newBookingsNeeded.toString(),
      b.revenueContribution.toFixed(2),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-forecast-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Forecast data has been exported to CSV.",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const ForecastSkeleton = () => (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </div>
  );

  if (yearsLoading || gradesLoading) {
    return (
      <AdminLayout
        pageTitle="Financial Forecast"
        subtitle="Calculate how many students you need to reach your revenue target"
      >
        <ForecastSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      pageTitle="Financial Forecast"
      subtitle="Calculate how many students you need to reach your revenue target"
    >
      <div className="space-y-6">
        {/* Input Section */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Forecast Parameters
            </CardTitle>
            <CardDescription>
              Enter your target revenue and select filters to generate a financial forecast
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="target-revenue">Target Revenue (£)</Label>
                <Input
                  id="target-revenue"
                  type="text"
                  placeholder="2,500,000"
                  value={targetRevenue}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    if (value) {
                      const num = parseInt(value, 10);
                      setTargetRevenue(num.toLocaleString("en-GB"));
                    } else {
                      setTargetRevenue("");
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="academic-year">Academic Year</Label>
                <Select value={academicYearId} onValueChange={setAcademicYearId}>
                  <SelectTrigger id="academic-year">
                    <SelectValue placeholder="Select academic year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears?.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name} {year.is_active && "(Active)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Studio Grades (Optional - leave empty for all)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                {studioGrades.map((grade) => (
                  <div key={grade.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`grade-${grade.id}`}
                      checked={selectedGrades.includes(grade.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedGrades([...selectedGrades, grade.id]);
                        } else {
                          setSelectedGrades(selectedGrades.filter((id) => id !== grade.id));
                        }
                      }}
                    />
                    <Label
                      htmlFor={`grade-${grade.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {grade.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-existing"
                checked={includeExisting}
                onCheckedChange={(checked) => setIncludeExisting(checked as boolean)}
              />
              <Label htmlFor="include-existing" className="text-sm font-normal cursor-pointer">
                Include existing confirmed bookings in calculation
              </Label>
            </div>

            <Button
              className="rounded-full uppercase tracking-wide gap-2"
              onClick={handleCalculate}
              disabled={calculateForecast.isPending || !targetRevenue || !academicYearId}
            >
              {calculateForecast.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  Calculate Forecast
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {forecastResult && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-6 lg:grid-cols-4">
              <Card className="bg-primary text-primary-foreground rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-sm font-display uppercase tracking-wide">
                    Target Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold font-display">
                    {formatCurrency(forecastResult.targetRevenue)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-sm font-display uppercase tracking-wide">
                    Current Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold font-display">
                    {formatCurrency(forecastResult.currentRevenue)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-sm font-display uppercase tracking-wide">
                    Revenue Gap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold font-display text-primary">
                    {formatCurrency(forecastResult.revenueGap)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-sm font-display uppercase tracking-wide">
                    Students Needed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold font-display">
                    {forecastResult.totalStudentsNeeded}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Occupancy Impact */}
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Occupancy Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wide">
                      Current Occupancy
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {forecastResult.occupancyImpact.currentOccupancy.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {forecastResult.occupancyImpact.currentBookings} of{" "}
                      {forecastResult.occupancyImpact.totalStudios} studios
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wide">
                      Forecasted Occupancy
                    </p>
                    <p className="text-2xl font-bold text-primary mt-1">
                      {forecastResult.occupancyImpact.forecastedOccupancy.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {forecastResult.occupancyImpact.forecastedBookings} of{" "}
                      {forecastResult.occupancyImpact.totalStudios} studios
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wide">
                      Available Capacity
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {forecastResult.occupancyImpact.availableCapacity}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">studios available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Breakdown Table */}
            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
                    Contract Breakdown
                  </CardTitle>
                  <CardDescription>
                    Number of students needed per contract type to reach target
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide gap-2"
                  onClick={handleExportCSV}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Contract
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Studio Grade
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Weeks
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Weekly Price
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Contract Value
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Current
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Needed
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          New Needed
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold uppercase tracking-wide">
                          Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastResult.breakdown.map((item, index) => (
                        <tr
                          key={item.contractId}
                          className={index % 2 === 0 ? "bg-muted/30" : ""}
                        >
                          <td className="py-3 px-4 font-medium">{item.contractName}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {item.studioGradeName}
                          </td>
                          <td className="py-3 px-4 text-right">{item.weeks}</td>
                          <td className="py-3 px-4 text-right">
                            {formatCurrency(item.weeklyPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {formatCurrency(item.totalContractValue)}
                          </td>
                          <td className="py-3 px-4 text-right">{item.currentBookings}</td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {item.studentsNeeded}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-primary">
                            {item.newBookingsNeeded}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {formatCurrency(item.revenueContribution)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recalculate Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="rounded-full uppercase tracking-wide gap-2"
                onClick={handleCalculate}
                disabled={calculateForecast.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                Recalculate
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default FinancialForecast;

