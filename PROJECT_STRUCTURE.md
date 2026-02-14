# PolizaLab MVP - Project Structure

## Directory Structure

```
polizalab-mvp/
├── .git/                   # Git repository
├── .kiro/                  # Kiro specifications
│   └── specs/
│       └── polizalab-mvp/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
├── .next/                  # Next.js build output (generated)
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── globals.css         # Global styles
│   └── favicon.ico         # Favicon
├── components/             # React components
│   └── (to be created)
├── lib/                    # Utility functions and helpers
│   ├── __tests__/          # Tests for lib utilities
│   │   └── constants.test.ts
│   └── constants.ts        # Application constants
├── types/                  # TypeScript type definitions
│   └── index.ts            # Core type definitions
├── node_modules/           # Dependencies (generated)
├── public/                 # Static assets
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── .prettierrc             # Prettier configuration
├── .prettierignore         # Prettier ignore rules
├── eslint.config.mjs       # ESLint configuration
├── jest.config.ts          # Jest configuration
├── jest.setup.ts           # Jest setup file
├── next.config.ts          # Next.js configuration
├── next-env.d.ts           # Next.js TypeScript declarations
├── package.json            # Project dependencies and scripts
├── package-lock.json       # Locked dependencies
├── postcss.config.mjs      # PostCSS configuration
├── PROJECT_STRUCTURE.md    # This file
├── README.md               # Project documentation
└── tsconfig.json           # TypeScript configuration
```

## Key Files and Their Purpose

### Configuration Files

- **tsconfig.json**: TypeScript compiler configuration with strict mode enabled
- **jest.config.ts**: Jest testing framework configuration
- **jest.setup.ts**: Jest setup for React Testing Library
- **eslint.config.mjs**: ESLint linting rules
- **.prettierrc**: Code formatting rules
- **next.config.ts**: Next.js framework configuration
- **postcss.config.mjs**: PostCSS and Tailwind CSS configuration

### Source Code

- **app/**: Next.js App Router pages and layouts
- **components/**: Reusable React components (to be populated)
- **lib/**: Utility functions, helpers, and business logic
- **types/**: TypeScript type definitions and interfaces

### Environment

- **.env.example**: Template for environment variables
- **.env.local**: Local environment variables (not in git, to be created)

## Development Workflow

### Adding New Features

1. **Types**: Define types in `types/index.ts` or create new type files
2. **Utilities**: Add helper functions in `lib/`
3. **Components**: Create React components in `components/`
4. **Pages**: Add routes in `app/` directory
5. **Tests**: Write tests alongside code in `__tests__/` directories

### Testing Structure

- Unit tests: `*.test.ts` or `*.test.tsx`
- Property-based tests: Use `fast-check` library
- Test location: Co-located with source in `__tests__/` directories

### Code Quality

- **Linting**: `npm run lint`
- **Formatting**: `npm run format`
- **Type checking**: Automatic with TypeScript
- **Testing**: `npm test`

## Next Steps

Refer to `.kiro/specs/polizalab-mvp/tasks.md` for the implementation plan.

Current status: Task 1 (Project setup) completed ✓
