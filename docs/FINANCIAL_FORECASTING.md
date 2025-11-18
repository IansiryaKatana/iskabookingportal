# Financial Forecasting Feature - Specification

## Overview
A financial forecasting tool that calculates how many students of each contract/payment plan type are needed to reach a target revenue goal.

## Example Scenario
- **Target Revenue**: £2,500,000
- **Contract Types Available**:
  - 51-week contract at £100/week = £5,100 per student
  - 45-week contract at £100/week = £4,500 per student
  - Full payment option = varies
- **Result**: 
  - Need ~490 students on 51-week contracts, OR
  - Need ~556 students on 45-week contracts, OR
  - Mix of both

## Questions for Clarification

### 1. **Revenue Calculation Basis**
Should the forecast consider:
- **Option A**: Total contract value (weekly_price × weeks) regardless of payment plan?
  - Example: 51-week at £100/week = £5,100 (whether paid in full or instalments)
- **Option B**: Only revenue received (deposit + instalments actually paid)?
  - Example: If student pays deposit + 1 instalment, only count that amount
- **Recommendation**: Option A (total contract value) - this represents committed revenue

### 2. **Studio Grade Consideration**
Should the forecast:
- **Option A**: Use average pricing across all studio grades?
- **Option B**: Show breakdown by studio grade (Silver £165, Gold £179, etc.)?
- **Option C**: Allow selection of specific studio grades to forecast?
- **Recommendation**: Option B - show breakdown by grade, then aggregate

### 3. **Payment Plan Impact**
Should different payment plans affect the forecast?
- **Option A**: No - all payment plans for same contract = same revenue
  - 51-week contract = £5,100 whether 3-instalment, 4-instalment, or pay-in-full
- **Option B**: Yes - consider payment plan type in calculations
  - Pay-in-full might have discount?
  - Different instalment plans might have different total amounts?
- **Recommendation**: Option A (unless there are discounts/price differences)

### 4. **Current vs New Bookings**
Should the forecast:
- **Option A**: Show only NEW bookings needed (exclude existing confirmed bookings)?
- **Option B**: Show total bookings needed (including existing)?
- **Recommendation**: Option A - show gap to fill

### 5. **Occupancy Integration**
How should occupancy data be used?
- **Option A**: Show current occupancy % and forecasted occupancy % after target
- **Option B**: Use occupancy to calculate available capacity (max_students - current_students)
- **Option C**: Both - show occupancy % and available capacity
- **Recommendation**: Option C

### 6. **Forecast Scenarios**
Should the tool support:
- **Option A**: Single scenario (one target, one result)
- **Option B**: Multiple scenarios (compare different targets)
- **Option C**: What-if analysis (adjust contract mix, see impact)
- **Recommendation**: Option C - most flexible

### 7. **Time Period**
Should forecast be:
- **Option A**: Per academic year
- **Option B**: Annual (12 months)
- **Option C**: Custom date range
- **Recommendation**: Option A (per academic year) with option for custom

## Proposed Implementation

### Database Schema
```sql
-- Financial Forecasts (save scenarios)
CREATE TABLE financial_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  academic_year_id UUID REFERENCES academic_years(id),
  target_revenue NUMERIC(12,2) NOT NULL,
  forecast_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forecast Breakdown (per contract type)
CREATE TABLE financial_forecast_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  studio_grade_id UUID REFERENCES studio_grades(id),
  contract_weeks INTEGER NOT NULL,
  weekly_price NUMERIC(10,2) NOT NULL,
  total_contract_value NUMERIC(10,2) NOT NULL,
  students_needed INTEGER NOT NULL,
  revenue_contribution NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Calculation Logic

```typescript
interface ForecastInput {
  targetRevenue: number;
  academicYearId: string;
  includeExistingBookings?: boolean; // default: false
  studioGradeFilter?: string[]; // optional: filter by grades
}

interface ForecastResult {
  targetRevenue: number;
  currentRevenue: number; // from existing confirmed bookings
  revenueGap: number; // target - current
  breakdown: ContractBreakdown[];
  totalStudentsNeeded: number;
  occupancyImpact: {
    currentOccupancy: number;
    forecastedOccupancy: number;
    availableCapacity: number;
  };
}

interface ContractBreakdown {
  contractId: string;
  contractName: string;
  studioGrade: string;
  weeks: number;
  weeklyPrice: number;
  totalContractValue: number;
  studentsNeeded: number;
  revenueContribution: number;
  currentBookings: number; // existing confirmed
  newBookingsNeeded: number; // gap to fill
}
```

### Algorithm

```typescript
async function calculateForecast(input: ForecastInput): Promise<ForecastResult> {
  // 1. Get all active contracts for academic year
  const contracts = await getActiveContracts(input.academicYearId);
  
  // 2. Calculate current revenue from confirmed bookings
  const currentBookings = await getConfirmedBookings(input.academicYearId);
  const currentRevenue = currentBookings.reduce((sum, booking) => {
    const contractValue = booking.weekly_price * booking.weeks;
    return sum + contractValue;
  }, 0);
  
  // 3. Calculate revenue gap
  const revenueGap = input.targetRevenue - currentRevenue;
  
  // 4. For each contract type, calculate students needed
  const breakdown = contracts.map(contract => {
    const contractValue = contract.weekly_price * contract.weeks;
    const studentsNeeded = Math.ceil(revenueGap / contractValue);
    const currentBookingsForContract = currentBookings.filter(
      b => b.contract_id === contract.id
    ).length;
    
    return {
      contractId: contract.id,
      contractName: contract.name,
      studioGrade: contract.studio_grade.name,
      weeks: contract.weeks,
      weeklyPrice: contract.weekly_price,
      totalContractValue: contractValue,
      studentsNeeded: studentsNeeded,
      revenueContribution: studentsNeeded * contractValue,
      currentBookings: currentBookingsForContract,
      newBookingsNeeded: studentsNeeded - currentBookingsForContract
    };
  });
  
  // 5. Calculate occupancy impact
  const totalStudios = await getTotalStudios(input.academicYearId);
  const currentOccupancy = (currentBookings.length / totalStudios) * 100;
  const totalStudentsNeeded = breakdown.reduce((sum, b) => sum + b.studentsNeeded, 0);
  const forecastedOccupancy = ((currentBookings.length + totalStudentsNeeded) / totalStudios) * 100;
  
  return {
    targetRevenue: input.targetRevenue,
    currentRevenue,
    revenueGap,
    breakdown,
    totalStudentsNeeded,
    occupancyImpact: {
      currentOccupancy,
      forecastedOccupancy,
      availableCapacity: totalStudios - currentBookings.length
    }
  };
}
```

### UI Design

**Route**: `/admin/finance/forecast`

**Features**:
1. **Input Section**:
   - Target Revenue (currency input)
   - Academic Year (dropdown)
   - Studio Grade Filter (multi-select, optional)
   - Include Existing Bookings (checkbox)

2. **Results Section**:
   - **Summary Cards**:
     * Target Revenue
     * Current Revenue (from confirmed bookings)
     * Revenue Gap
     * Total Students Needed
   
   - **Breakdown Table**:
     * Contract Name
     * Studio Grade
     * Weeks
     * Weekly Price
     * Total Contract Value
     * Current Bookings
     * Students Needed
     * New Bookings Needed
     * Revenue Contribution
   
   - **Occupancy Impact**:
     * Current Occupancy %
     * Forecasted Occupancy %
     * Available Capacity
   
   - **Visualizations**:
     * Pie chart: Revenue by contract type
     * Bar chart: Students needed by contract type
     * Line chart: Occupancy trend

3. **Actions**:
   - Save Forecast (save scenario)
   - Export to CSV
   - Compare Scenarios (if multiple saved)
   - Adjust & Recalculate

### Advanced Features (Future)

1. **What-If Analysis**:
   - Adjust number of students per contract type
   - See impact on total revenue
   - Find optimal mix

2. **Multi-Contract Mix**:
   - Calculate optimal distribution across contract types
   - Example: "To reach £2.5M, need 20 full-payment + 100 51-week + 50 45-week"

3. **Time-Based Forecasting**:
   - Forecast by month/quarter
   - Show booking velocity needed

4. **Historical Comparison**:
   - Compare forecast vs actuals
   - Learn from past performance

## Questions for User

1. **Revenue Basis**: Should we use total contract value (weekly_price × weeks) or actual payments received?
2. **Studio Grades**: Show breakdown by grade or use average pricing?
3. **Payment Plans**: Do different payment plans (3-instalment vs pay-in-full) affect total revenue?
4. **Current Bookings**: Include existing confirmed bookings in calculation or show only gap?
5. **Occupancy**: How should we use occupancy data - show %, capacity, or both?
6. **Scenarios**: Single forecast or multiple scenario comparison?
7. **Time Period**: Per academic year or custom date range?

## Next Steps

Once clarified, I'll implement:
1. Database schema
2. Calculation Edge Function
3. Admin UI page
4. Integration with occupancy data
5. Export functionality

