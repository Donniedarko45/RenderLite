
**RenderLite — A Simplified Platform-as-a-Service for Automated Backend Deployment**

---

# Overall Goal

To build a mini PaaS platform that allows users to deploy backend applications directly from GitHub repositories using container automation, dynamic routing, and real-time monitoring.

---

---

#  MODULE-WISE SYSTEM DESIGN

RenderLite is divided into **7 major modules**, each with clear responsibilities.

---

---

#  Module 1 — User & Authentication Module

### Purpose

Provides secure access to the platform and connects the developer’s GitHub identity.

---

### Key Features

* User registration/login via GitHub OAuth
* Stores user profile in PostgreSQL
* Ensures only authenticated users can deploy services

---

### Tools & Technologies Used

| Component             | Tool                |
| --------------------- | ------------------- |
| Authentication        | GitHub OAuth        |
| Backend Auth Handling | Express.js          |
| User Storage          | PostgreSQL + Prisma |

---

### Database Entities

* `User`

  * id, email, githubId, createdAt

---

### Output

 Authenticated developer session
 User dashboard enabled

---

---

# Module 2 — Project & Service Management Module

### Purpose

Allows a developer to organize deployments into projects and deployable services.

---

### Key Features

* Create a project (like Render workspace)
* Register backend services inside project
* Store GitHub repository info
* Maintain service lifecycle state

---

### Tools Used

| Component   | Tool       |
| ----------- | ---------- |
| Service API | Express.js |
| Data Layer  | Prisma ORM |
| Database    | PostgreSQL |

---

### Database Entities

* `Project`
* `Service`

---

### Service Metadata Stored

* Repo URL
* Branch
* Runtime type
* Subdomain
* Status (created/running/failed)

---

### Output

 Services ready for deployment
 Repo connected to platform

---

---

#  Module 3 — Deployment Orchestration Module (Control Plane)

### Purpose

Handles deployment requests and stores deployment history.

---

### Key Features

* User triggers deployment from dashboard
* API creates deployment record
* Deployment runs asynchronously via job queue

---

### Tools Used

| Component           | Tool              |
| ------------------- | ----------------- |
| API Control         | Node.js + Express |
| Deployment Tracking | PostgreSQL        |
| Queue Trigger       | BullMQ            |

---

### Database Entities

* `Deployment`

---

### Deployment Lifecycle

```
QUEUED → BUILDING → SUCCESS → FAILED
```

---

### Output

 Deployment request registered
Worker execution triggered

---

---
#  Module 4 — Execution Engine Module (Worker)

### Purpose

This is the heart of RenderLite — responsible for converting source code into running services.

---

### Responsibilities

 Clone GitHub repository
 Detect runtime
 Build container image
 Run container using Docker
 Handle failures + cleanup

---

### Tools & Technologies

| Component               | Tool          |
| ----------------------- | ------------- |
| Worker Runtime          | Node.js       |
| Container Control       | Dockerode     |
| Source Build Automation | Nixpacks      |
| Task Execution          | BullMQ Worker |

---

### Workflow Steps

1. Clone repo
2. Runtime detection
3. Build image:

   * Dockerfile → Docker build
   * No Dockerfile → Nixpacks build
4. Launch container
5. Send logs back

---

### Output

 Container successfully running
 Deployment marked successful

---

---

#  Module 5 — Container Runtime & Isolation Module

### Purpose

Ensures every user application runs securely inside isolated containers.

---

### Key Features

* Backend apps run as Docker containers
* Non-root execution for security
* Container lifecycle control (start, stop, restart)

---

### Tools Used

| Component         | Tool                 |
| ----------------- | -------------------- |
| Runtime           | Docker Engine        |
| Isolation         | Container namespaces |
| Execution Control | Dockerode            |

---

### Output

 Multi-service deployments
 Safe container sandbox execution

---

---

#  Module 6 — Dynamic Routing & Networking Module

### Purpose

Expose deployed services on the internet with automatic routing.

---

### Key Features

* Each service gets a subdomain
* Routing is automatic based on Docker labels
* No manual Nginx configuration required

---

### Tools Used

| Component     | Tool          |
| ------------- | ------------- |
| Reverse Proxy | Traefik       |
| Routing Rules | Docker Labels |
| URL Exposure  | Subdomains    |

---

### Example Routing

```
service123.renderlite.local → container
```

---

### Output

 Live URL assigned instantly
 Request forwarding handled automatically

---

---

#  Module 7 — Observability & Monitoring Module

### Purpose

Provides real-time insight into deployments and running apps.

---

### Key Features

 Build and runtime logs
 Live streaming logs via WebSockets
 CPU/RAM usage visualization
 Deployment history monitoring

---

### Tools Used

| Component       | Tool                 |
| --------------- | -------------------- |
| Logs Collection | Docker logs API      |
| Streaming       | Socket.io            |
| Metrics Source  | Docker Stats API     |
| Visualization   | Recharts (Dashboard) |

---

### Output

 Real-time dashboard observability
 Developer-grade monitoring experience
---

---

#  Module 8 — Security & Failure Handling Module

### Purpose

Ensures platform stability and prevents misuse during deployments.

---

### Key Security Features

* Encrypted environment variables
* Repo cloning size + timeout limits
* Build execution timeout
* Automatic cleanup of failed containers

---

### Tools Used

| Component          | Tool              |
| ------------------ | ----------------- |
| Encryption         | AES-256           |
| Limits Enforcement | Worker safeguards |
| Cleanup Jobs       | Dockerode removal |

---

### Output

 Stable and safe deployment platform
 Prevents resource leaks

---

---

#  Final Module Summary Table

| Module | Name                                     |
| ------ | ---------------------------------------- |
| 1      | Authentication & User Management         |
| 2      | Project & Service Registration           |
| 3      | Deployment Control Plane                 |
| 4      | Execution Engine (Worker + Build System) |
| 5      | Container Runtime & Isolation            |
| 6      | Dynamic Routing with Traefik             |
| 7      | Monitoring, Logs & Metrics Dashboard     |
| 8      | Security, Cleanup & Failure Recovery     |

---

---
