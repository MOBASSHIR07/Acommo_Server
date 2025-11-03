# 🏠 Acommo Server

This is the backend server for the **Acommo Property Booking Platform**, built using **Node.js**, **Express**, and **MongoDB**.  
It handles user authentication, room and booking management, secure payments via **Stripe**, and email notifications.

---

## ✨ Features

- **JWT Authentication**  
  Secure token creation, validation (`/jwt`), and revocation (`/logout`) using cookies.  
  The cookie is configured to be `secure` and use `SameSite: None` in production — necessary for cross-site cookie use (e.g., Vercel backend and separate frontend).

- **Role-Based Access Control (RBAC)**  
  Dedicated middlewares (`verifyAdmin`, `verifyHost`) restrict API access to authorized user roles only.

- **User Management**  
  Handles:
  - User registration and updates  
  - Host role requests (`status: 'Requested'`)  
  - Admin control over user roles/status  

- **Room Management**  
  Full CRUD operations for rooms:
  - Fetch all rooms (with optional category filtering)  
  - Fetch a single room  
  - Add, update, and delete rooms (restricted to Hosts)  

- **Booking & Payments**  
  Implements secure checkout flow using **Stripe** (`/create-payment-intent`) and handles:
  - Booking creation  
 
- **Email Notifications**  
  Sends essential updates (welcome emails, booking confirmations) using **Nodemailer**.

- **Statistics Endpoints**  
  Provides aggregated dashboard data for:
  - Admin → `/admin-statistics`  
  - Guest → `/guest-statistics`  
  - Host → `/host-statistics`

---

## 🛠️ Tech Stack

| **Category** | **Technology** | **Purpose** |
|--------------|----------------|--------------|
| **Backend** | Node.js, Express.js | Server framework and runtime environment |
| **Database** | MongoDB | Persistent storage for users, rooms, and bookings |
| **Auth** | JSON Web Tokens (jsonwebtoken), cookie-parser | Secure session management |
| **Payments** | Stripe | Payment intent creation |
| **Email** | Nodemailer | Sending automated email confirmations |
| **Deployment** | Vercel | Serverless deployment platform (configured via vercel.json) |
