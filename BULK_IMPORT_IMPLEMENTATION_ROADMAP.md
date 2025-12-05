# Bulk Import System - Implementation Roadmap

## Overview

This roadmap outlines the complete bulk import system needed for your SaaS student accommodation booking platform. The system enables new client organizations to migrate all their historical data when adopting your platform.

## Business Context

**Your Product**: SaaS platform for student accommodation booking  
**Client Need**: Migrate historical data from previous systems  
**Key Requirement**: Bulk import ALL entities needed for a complete setup

## Entities Requiring Bulk Import

### Foundation (Import First)
1. ✅ **Academic Years** - Year definitions (2025/2026, 2026/2027, etc.)
2. ✅ **Studio Grades** - Studio types (Silver, Gold, Platinum, etc.)
3. ✅ **Studios** - Individual studio units (upload once, reused across years)

### Academic Year Configuration
4. ✅ **Studio Grade Prices** - Pricing per academic year + grade
5. ✅ **Payment Plans** - Payment plan definitions per academic year
6. ✅ **Payment Plan Installments** - Installment schedules
7. ✅ **Contracts** - Contract templates per academic year + grade

### Operational Setup
8. ✅ **Partners** - Partner referral organizations
9. ✅ **Cashback Campaigns** - Promotional campaigns

### Historical Data
10. ✅ **Applications** - Student applications with all 6 steps
11. ✅ **Documents** - Application documents
12. ✅ **Payments** - Historical payment records

## Key Understanding: Studio Model

**Critical Point**: Studios are uploaded **ONCE** and remain constant. Only availability changes based on applications per academic year.

- Studios = Physical units (don't change)
- Import studios once during initial setup
- Studio availability per academic year is calculated dynamically
- Status/allocation updated via applications or manual admin actions

## Import Dependency Order

```
┌─────────────────────────────────────────┐
│  LEVEL 1: Foundation (No Dependencies) │
├─────────────────────────────────────────┤
│  • Academic Years                       │
│  • Studio Grades                        │
│  • Studios (references Studio Grades)   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LEVEL 2: Academic Year Config         │
├─────────────────────────────────────────┤
│  • Studio Grade Prices                  │
│  • Payment Plans                        │
│  • Payment Plan Installments            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LEVEL 3: Contracts                    │
├─────────────────────────────────────────┤
│  • Contracts (requires all above)       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LEVEL 4: Operational Setup            │
├─────────────────────────────────────────┤
│  • Partners                            │
│  • Cashback Campaigns                  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LEVEL 5: Historical Data              │
├─────────────────────────────────────────┤
│  • Applications (requires Contracts)    │
│  • Application Steps                   │
│  • Documents                           │
│  • Payments                            │
│  • Partner Referrals                   │
│  • Application Cashbacks               │
└─────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Foundation Imports (Week 1-2)
**Priority**: CRITICAL

1. **Academic Years Import**
   - CSV template
   - Validation logic
   - Admin UI page

2. **Studio Grades Import**
   - CSV template
   - Validation logic
   - Admin UI page

3. **Studios Import** (One-time upload)
   - CSV template
   - Studio grade reference resolution
   - Admin UI page

**Deliverables**:
- Edge function: `bulk-import-foundation`
- Database functions for each entity
- Admin UI: `/admin/data-import/foundation`
- CSV templates for download

### Phase 2: Academic Year Configuration (Week 3)
**Priority**: CRITICAL

1. **Studio Grade Prices Import**
   - Per academic year pricing
   - CSV template
   - Validation

2. **Payment Plans Import**
   - Main plans CSV
   - Installments CSV
   - Linked import

3. **Contracts Import**
   - Complex entity with multiple references
   - CSV template
   - Validation logic

**Deliverables**:
- Edge function: `bulk-import-academic-config`
- Database functions
- Admin UI: `/admin/data-import/academic-config`
- CSV templates

### Phase 3: Applications Import (Week 4-5)
**Priority**: HIGH

1. **Applications Import**
   - Full 6-step application data
   - User creation/finding
   - Dependency validation

2. **Application Steps Import**
   - JSONB payloads for each step
   - Linked to applications

3. **Documents Import**
   - Document upload handling
   - Storage path management

**Deliverables**:
- Edge function: `bulk-import-applications`
- Database functions (see detailed proposal)
- Admin UI: `/admin/data-import/applications`
- CSV template

**Reference**: See `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md` for detailed spec

### Phase 4: Supporting Imports (Week 6)
**Priority**: MEDIUM

1. **Partners Import**
   - Partner organizations
   - Referral codes
   - Commission rates

2. **Cashback Campaigns Import**
   - Campaign definitions
   - Date ranges
   - Usage limits

3. **Payments Import**
   - Historical payment records
   - Stripe payments
   - Manual payments

**Deliverables**:
- Edge function: `bulk-import-operational`
- Database functions
- Admin UI pages
- CSV templates

### Phase 5: Unified Interface & Enhancements (Week 7-8)
**Priority**: MEDIUM

1. **Unified Import Wizard**
   - Multi-step wizard
   - Dependency checking
   - Progress tracking
   - Import history

2. **Enhanced Features**
   - Import validation preview
   - Error correction tools
   - Import reports
   - Template downloads

**Deliverables**:
- Admin UI: `/admin/data-import` (unified)
- Import wizard component
- Import history viewer
- Template library

## Technical Architecture

### Unified Admin Interface

**Location**: `/admin/data-import`

**Features**:
- Step-by-step wizard
- Dependency visualization
- Progress tracking
- Error reporting
- Import history

### Edge Functions

1. `bulk-import-foundation` - Academic years, studio grades, studios
2. `bulk-import-academic-config` - Prices, payment plans, contracts
3. `bulk-import-applications` - Applications and related data
4. `bulk-import-operational` - Partners, cashbacks, payments

### Database Functions

**Location**: `supabase/migrations/YYYYMMDD_bulk_import_functions.sql`

**Functions**:
- `bulk_import_academic_years()`
- `bulk_import_studio_grades()`
- `bulk_import_studios()`
- `bulk_import_studio_grade_prices()`
- `bulk_import_payment_plans()`
- `bulk_import_contracts()`
- `bulk_import_applications()` (complex - see detailed proposal)
- `bulk_import_partners()`
- `bulk_import_cashback_campaigns()`
- `validate_import_dependencies()`

### CSV Templates

**Location**: `/admin/data-import/templates/`

**Templates**:
- `academic_years_template.csv`
- `studio_grades_template.csv`
- `studios_template.csv`
- `studio_grade_prices_template.csv`
- `payment_plans_template.csv`
- `payment_plan_installments_template.csv`
- `contracts_template.csv`
- `partners_template.csv`
- `cashback_campaigns_template.csv`
- `applications_template.csv` (complex - see detailed proposal)

## CSV Template Structure

### Minimal Example: Academic Years

```csv
name,start_date,end_date,is_active
2025/2026,2025-09-01,2026-08-31,false
2026/2027,2026-09-01,2027-08-31,true
```

### Complex Example: Studios

```csv
studio_number,studio_grade_slug,floor,status,allocation,is_active
101,silver,1,available,,true
102,silver,1,available,,true
201,gold,2,occupied,Student,true
```

### Most Complex: Applications

See `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md` for complete template structure.

## Implementation Checklist

### Phase 1: Foundation
- [ ] Academic Years CSV template
- [ ] Academic Years import function
- [ ] Academic Years UI page
- [ ] Studio Grades CSV template
- [ ] Studio Grades import function
- [ ] Studio Grades UI page
- [ ] Studios CSV template
- [ ] Studios import function
- [ ] Studios UI page
- [ ] Testing with sample data

### Phase 2: Academic Config
- [ ] Studio Grade Prices CSV template
- [ ] Studio Grade Prices import function
- [ ] Payment Plans CSV template
- [ ] Payment Plans import function
- [ ] Payment Plan Installments CSV template
- [ ] Payment Plan Installments import function
- [ ] Contracts CSV template
- [ ] Contracts import function
- [ ] UI pages for all above
- [ ] Testing with sample data

### Phase 3: Applications
- [ ] Applications CSV template (see detailed proposal)
- [ ] Applications import function (see detailed proposal)
- [ ] Application Steps import logic
- [ ] Documents import handling
- [ ] UI page for applications import
- [ ] Testing with sample data

### Phase 4: Supporting
- [ ] Partners CSV template
- [ ] Partners import function
- [ ] Cashback Campaigns CSV template
- [ ] Cashback Campaigns import function
- [ ] Payments CSV template
- [ ] Payments import function
- [ ] UI pages
- [ ] Testing

### Phase 5: Unified Interface
- [ ] Import wizard component
- [ ] Dependency checker
- [ ] Progress tracker
- [ ] Error viewer
- [ ] Import history table
- [ ] Import history viewer
- [ ] Template library
- [ ] Documentation

## Success Metrics

### Functional Requirements
- ✅ All entity types can be imported
- ✅ Dependencies are validated
- ✅ Errors are clearly reported
- ✅ Import history is tracked
- ✅ Templates are available

### Performance Requirements
- ✅ Handle 1000+ rows per import
- ✅ Process imports in reasonable time (< 5 min for 1000 rows)
- ✅ Progress updates every 10-20 rows
- ✅ Error recovery continues processing

### User Experience Requirements
- ✅ Clear step-by-step process
- ✅ Helpful error messages
- ✅ Template downloads available
- ✅ Import reports downloadable

## Risk Mitigation

### Technical Risks
- **Risk**: Large imports timeout
  - **Mitigation**: Batch processing, progress updates

- **Risk**: Data corruption during import
  - **Mitigation**: Transaction boundaries, validation before commit

- **Risk**: Dependency issues
  - **Mitigation**: Pre-import validation, clear error messages

### Business Risks
- **Risk**: Client data migration failures
  - **Mitigation**: Comprehensive testing, detailed documentation

- **Risk**: Slow onboarding process
  - **Mitigation**: Streamlined wizard, helpful templates

## Documentation Requirements

### User Documentation
- Step-by-step import guides
- CSV template documentation
- Common error resolution
- Best practices guide

### Technical Documentation
- API documentation
- Database function specs
- Edge function architecture
- Error codes reference

## Testing Strategy

### Unit Tests
- CSV parsing
- Validation functions
- Data transformation

### Integration Tests
- End-to-end import flows
- Dependency validation
- Error handling

### Load Tests
- Large file imports (1000+ rows)
- Concurrent imports
- Performance benchmarks

## Deployment Plan

### Development
- Build features incrementally
- Test each phase thoroughly

### Staging
- Import sample client data
- Test complete workflows
- Gather feedback

### Production
- Gradual rollout
- Monitor closely
- Support clients during migration

## Timeline Summary

- **Weeks 1-2**: Foundation imports (Academic Years, Studio Grades, Studios)
- **Week 3**: Academic year configuration (Prices, Payment Plans, Contracts)
- **Weeks 4-5**: Applications import (complex)
- **Week 6**: Supporting imports (Partners, Cashbacks, Payments)
- **Weeks 7-8**: Unified interface and enhancements

**Total Estimated Time**: 8 weeks

## Next Steps

1. **Review this roadmap** - Confirm priorities and approach
2. **Approve Phase 1** - Begin foundation imports
3. **Assign resources** - Development team allocation
4. **Create templates** - Design CSV templates
5. **Start implementation** - Begin Phase 1 development

## Related Documentation

- **Comprehensive System**: `docs/COMPREHENSIVE_BULK_IMPORT_SYSTEM.md`
- **Application Import**: `docs/BULK_APPLICATION_IMPORT_PROPOSAL.md`
- **Quick Start**: `docs/BULK_IMPORT_QUICK_START.md`
- **Architecture**: `docs/architecture-spec.md`

---

**This roadmap provides a complete path to implementing bulk import functionality for all entities in your SaaS platform, enabling smooth client onboarding with full data migration capabilities.**

