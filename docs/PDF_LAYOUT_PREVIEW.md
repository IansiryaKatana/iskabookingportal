# Payment History PDF Layout Preview

## Page Structure (A4: 595 x 842 points)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [LOGO - Max 150px width, auto-height]                         │
│  (Positioned at top-left, 50px from left, 50px from top)       │
│                                                                 │
│  COMPANY NAME                                                   │
│  (24pt, Bold, Primary Color - #E63946)                         │
│  (35px spacing after logo)                                     │
│                                                                 │
│  contact@email.com                                             │
│  +44 123 456 7890                                               │
│  (10pt, Muted Color, 18px spacing between, 35px after phone)  │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Payment History & Receipt                                     │
│  (20pt, Bold, Primary Color)                                   │
│  (45px spacing after title)                                    │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Student Information                                           │
│  (14pt, Bold)                                                  │
│  (25px spacing)                                                │
│                                                                 │
│  Name:              John Smith                                 │
│  (Bold label at x:50, Content at x:120)                       │
│  (25px spacing after)                                          │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Contract Information                                          │
│  (14pt, Bold)                                                  │
│  (25px spacing)                                                │
│                                                                 │
│  Contract:          Academic Year 2024-2025                    │
│  Period:            01/09/2024 to 31/08/2025                   │
│  Studio Grade:      Premium Studio                              │
│  (Bold labels, 20px spacing between items, 25px after section)│
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Payment Summary                                                │
│  (14pt, Bold)                                                  │
│  (25px spacing)                                                │
│                                                                 │
│  Total Due:         £5,000.00                                   │
│  Total Paid:        £5,000.00                                   │
│  Remaining Balance: £0.00                                        │
│  (Bold labels, 20px spacing, 35px after section)               │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Payment History                                                │
│  (14pt, Bold)                                                  │
│  (25px spacing)                                                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Date        Type          Description         Amount     │ │
│  │ (10pt Bold) (10pt Bold)   (10pt Bold)        (10pt Bold) │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ 15/01/2024  Deposit       Deposit Payment     £99.00     │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ 01/09/2024  Installment   Installment 1      £1,225.25  │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ 01/10/2024  Installment   Installment 2      £1,225.25  │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ 01/11/2024  Installment   Installment 3      £1,225.25  │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ 01/12/2024  Installment   Installment 4      £1,225.25  │ │
│  └──────────────────────────────────────────────────────────┘ │
│  (9pt font, 20px row spacing, border lines between rows)      │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  [FULLY PAID STAMP - if applicable]                           │
│  (Top-right corner, badge style with checkmark)                │
│                                                                 │
│  ───────────────────────────────────────────────────────────  │
│                                                                 │
│  Generated: 25/01/2025                                          │
│  (10pt, Muted Color, bottom of page)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Design Details

### Header Section
- **Logo**: 
  - Max width: 150px
  - Maintains aspect ratio
  - Position: Top-left (50px from left, 50px from top)
  - Supports PNG and JPEG formats
  
- **Company Name**: 
  - Size: 24pt, Bold
  - Color: Primary brand color (#E63946)
  - Position: Below logo (35px spacing)

- **Contact Info**: 
  - Email and phone
  - Size: 10pt
  - Color: Muted foreground color
  - Spacing: 18px between items, 35px after phone

### Title Section
- **"Payment History & Receipt"**
  - Size: 20pt, Bold
  - Color: Primary brand color
  - Spacing: 45px after title

### Student Information Section
- **Section Title**: 14pt, Bold
- **Labels**: Bold, positioned at x:50
- **Content**: Regular font, positioned at x:120
- **Spacing**: 25px after section title, 20-25px between items

### Contract Information Section
- Same label/content structure as Student Information
- Shows: Contract name, Period, Studio Grade
- Consistent spacing throughout

### Payment Summary Section
- **Section Title**: 14pt, Bold
- **Items**: 
  - Total Due
  - Total Paid
  - Remaining Balance
- **Format**: Bold labels at x:50, values at x:120
- **Spacing**: 25px after title, 20px between items, 35px after section

### Payment History Table
- **Section Title**: 14pt, Bold, 25px spacing
- **Table Headers**: 
  - Date (x:50)
  - Type (x:150)
  - Description (x:220)
  - Amount (x:450)
  - 10pt, Bold
- **Header Border**: Full-width line under headers (border color)
- **Table Rows**:
  - 9pt font
  - Border line between each transaction (0.5px thickness)
  - Border line after last transaction
  - 20px spacing between rows
  - Border color from branding settings

### Fully Paid Stamp (if applicable)
- **Position**: Top-right corner
- **Style**: Badge with decorative border
- **Color**: Success color from branding (#10B981)
- **Elements**: 
  - Outer circle with success color border
  - Inner circle with lighter shade
  - Checkmark icon in white
  - "FULLY PAID" text in bold

### Footer
- Generation date
- 10pt, Muted color
- Bottom of page

## Color Scheme
- **Primary**: #E63946 (from branding)
- **Foreground**: #000000 (main text)
- **Muted Foreground**: #64748B (secondary text)
- **Border**: #E2E8F0 (table borders)
- **Success**: #10B981 (fully paid stamp)

## Typography
- **Headers**: Helvetica Bold
- **Body**: Helvetica Regular
- **Sizes**: 
  - Company name: 24pt
  - Main title: 20pt
  - Section titles: 14pt
  - Labels: 11pt Bold
  - Content: 11pt Regular
  - Table headers: 10pt Bold
  - Table content: 9pt Regular
  - Contact info: 10pt Regular

## Spacing System
- **Section spacing**: 25-45px between major sections
- **Item spacing**: 15-20px between items within sections
- **Label-content spacing**: 70px (labels at x:50, content at x:120)
- **Table row spacing**: 20px between payment rows
- **Border spacing**: 5-10px around border lines

## Responsive Elements
- **Page breaks**: Automatically creates new pages if content exceeds page height
- **Text truncation**: Long descriptions truncated to 30 characters with "..."
- **Logo scaling**: Maintains aspect ratio regardless of original size

