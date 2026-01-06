# Login Credentials

## Admin User
- **Username:** `admin`
- **Password:** (any password works for demo)
- **Access Level:** Admin
- **Features:**
  - Full system access
  - Productivity Dashboard with targets/metrics
  - User Management (can view and manage all 3 agents)
  - Role Management
  - Department Management
  - System Settings

## Agent Users (3 Agents)

### Agent 1
- **Username:** `johndoe11`
- **Password:** (any password works for demo)
- **Name:** John Doe
- **Access Level:** Agent
- **Features:** All sales functionalities

### Agent 2
- **Username:** `janesmith22`
- **Password:** (any password works for demo)
- **Name:** Jane Smith
- **Access Level:** Agent
- **Features:** All sales functionalities

### Agent 3
- **Username:** `mikewilson33`
- **Password:** (any password works for demo)
- **Name:** Mike Wilson
- **Access Level:** Agent
- **Features:** All sales functionalities

## Member Users (Policy Number + DOB Login)

### Member 1 - Aetna
- **Policy Number:** `POL-2025-001`
- **Date of Birth:** `1955-03-15` (format: YYYY-MM-DD)
- **Name:** Robert Anderson
- **Carrier:** Aetna
- **Theme:** Aetna (purple/violet)
- **Features:**
  - Plan Information
  - Personal Information
  - Upcoming Appointments with Agent
  - Chat/Email option to reach Agent

### Member 2 - Humana
- **Policy Number:** `POL-2025-002`
- **Date of Birth:** `1948-07-22` (format: YYYY-MM-DD)
- **Name:** Mary Johnson
- **Carrier:** Humana
- **Theme:** Humana (green)
- **Features:**
  - Plan Information
  - Personal Information
  - Upcoming Appointments with Agent
  - Chat/Email option to reach Agent

## Access URLs

- **Admin/Agent Login:** `/login`
- **Member Login:** `/member/login`
- **Member Dashboard:** `/member/dashboard` (after login)

## Notes

- All passwords are accepted for demo purposes (any password works)
- Member login uses Policy Number and Date of Birth (no username/password)
- Theme automatically switches based on member's carrier (Aetna or Humana)
- Admin can view all agents in Productivity Dashboard
- Agents have access to all sales functionalities
- Members can only access their own information
