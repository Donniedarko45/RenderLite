# RenderLite — A Self-Hosted PaaS for Backend Deployment

## Core Design Principle

You are NOT building a hosting platform. You are building a **CONTROL PLANE**.
RenderLite controls Docker; it does not replace AWS.

## Architecture

- **Next.js UI**: Dashboard for users.
- **API Server (Control Plane)**: Node.js + TS, handles REST/WS.
- **Worker (Execution Engine)**: Node.js + TS + Dockerode + BullMQ. Handles builds and deployments.
- **Docker Engine**: Runs user apps.
- **Traefik**: Auto-routing based on labels.

## Tech Stack

- **Dockerode**: For programmatic Docker control.
- **Nixpacks**: For building images.
- **Traefik**: For dynamic reverse proxying.
- **PostgreSQL**: Primary database.
- **Redis**: Queue management (BullMQ).
