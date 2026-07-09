# ROLE & PERMISSION IMPACT AUDIT (PHASE 5.0.1A)

## Executive Summary
This document provides a comprehensive Role and Permission Impact Audit for the NTCC platform. It identifies every application module and the specific operations within them that require authorization. The resulting Permission Catalogue and Matrices establish a detailed blueprint for the centralized Permission Engine to be implemented in future phases. This audit ensures that every action is explicitly authorized according to the principle of least privilege, preventing unauthorized access and securing the application's functionality.

## Permission Catalogue

The following standardized permissions are defined to govern access across all platform modules:

**Public & Customer Permissions:**
- `VIEW_PUBLIC_PAGES`: Access Homepage, Lookbook, public Gallery.
- `VIEW_DESIGN_STUDIO`: Access the Design Studio and custom outfit builder.
- `SUBMIT_ORDER`: Finalize and submit an order in the Design Studio or Custom Order.
- `VIEW_CUSTOMER_PORTAL`: Access the personalized Customer Dashboard and order history.
- `MANAGE_PERSONAL_PROFILE`: Update personal details and measurements.

**Operational & Staff Permissions:**
- `VIEW_STAFF_DASHBOARD`: Access the administrative/staff backend dashboard.
- `UPDATE_PRODUCTION_STATUS`: Update the lifecycle state of a specific garment (e.g., to "Quality Control").
- `MANAGE_GALLERY`: Curate and publish photos to the Community Gallery.
- `VIEW_REPORTS`: Access Business Intelligence, analytics, and operational reports.

**Management Permissions:**
- `MANAGE_ORDERS`: View, edit, approve, or cancel customer orders.
- `MANAGE_TIMELINE`: Adjust production timelines and delivery windows.
- `MANAGE_BATCHES`: Create, edit, open, or close production batches.
- `MANAGE_FABRICS`: Add, edit, or archive items in the Fabric Library.
- `MANAGE_SHOWPIECES`: Manage the featured outfits and Showpieces catalogue.
- `MANAGE_MEDIA`: Upload and manage assets in the Media Repository.

**Administrative & High-Risk Permissions:**
- `MANAGE_CUSTOMERS`: View all customer PII, edit customer profiles, or suspend accounts.
- `MANAGE_REFERENCE_DATA`: Modify core taxonomy and reference datasets.
- `EXPORT_REPORTS`: Download CSV/PDF exports of financial or operational data.
- `APPROVE_PAYMENTS`: Authorize financial transactions and payment statuses.
- `MANAGE_SETTINGS`: Modify global application configurations and business settings.
- `MANAGE_USERS`: Assign staff roles, manage administrator accounts, and alter system privileges.

## Role Matrix

The platform defines the following roles, each carrying specific responsibilities:

- **Guest**: Unauthenticated visitor exploring the brand and designing mockups.
- **Customer**: Authenticated user managing their personal orders and profile.
- **Tailor / Production Staff**: Factory-level staff updating the status of garments they are working on.
- **Community Coordinator**: Marketing and community staff curating public galleries and engagement.
- **Production Manager**: Oversees the entire production lifecycle, capacity, and fabric inventory.
- **Administrator**: General business manager handling orders, customer service, and standard reports.
- **Super Administrator**: System owner with absolute technical and administrative control.

## Permission Matrix

| Permission | Guest | Customer | Tailor | Comm. Coord. | Prod. Mgr | Admin | Super Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `VIEW_PUBLIC_PAGES` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `VIEW_DESIGN_STUDIO` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SUBMIT_ORDER` | | ✓ | | | | ✓ | ✓ |
| `VIEW_CUSTOMER_PORTAL`| | ✓ | | | | ✓ | ✓ |
| `MANAGE_PERSONAL_PROFILE`| | ✓ | | | | ✓ | ✓ |
| `VIEW_STAFF_DASHBOARD`| | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `UPDATE_PRODUCTION_STATUS`| | | ✓ | | ✓ | ✓ | ✓ |
| `MANAGE_GALLERY` | | | | ✓ | | ✓ | ✓ |
| `VIEW_REPORTS` | | | | | ✓ | ✓ | ✓ |
| `MANAGE_ORDERS` | | | | | | ✓ | ✓ |
| `MANAGE_TIMELINE` | | | | | ✓ | ✓ | ✓ |
| `MANAGE_BATCHES` | | | | | ✓ | ✓ | ✓ |
| `MANAGE_FABRICS` | | | | | ✓ | ✓ | ✓ |
| `MANAGE_SHOWPIECES` | | | | ✓ | ✓ | ✓ | ✓ |
| `MANAGE_MEDIA` | | | | ✓ | ✓ | ✓ | ✓ |
| `MANAGE_CUSTOMERS` | | | | | | ✓ | ✓ |
| `MANAGE_REFERENCE_DATA`| | | | | | ✓ | ✓ |
| `EXPORT_REPORTS` | | | | | | ✓ | ✓ |
| `APPROVE_PAYMENTS` | | | | | | ✓ | ✓ |
| `MANAGE_SETTINGS` | | | | | | | ✓ |
| `MANAGE_USERS` | | | | | | | ✓ |

*(Note: Blank cells indicate the permission is implicitly denied for that role.)*

## High-Risk Permissions

Special attention must be paid to the following permissions when implementing Firestore rules and the Permission Engine:

- **`MANAGE_USERS`**: Absolute highest risk. Allows granting administrator status to other users. Must be strictly restricted to `Super Administrator`.
- **`MANAGE_SETTINGS`**: Controls global business rules and potentially impacts revenue. Restricted to `Super Administrator`.
- **`APPROVE_PAYMENTS`**: Financial risk. Bypasses standard payment gateways. Restricted to `Administrator` and `Super Administrator`.
- **`EXPORT_REPORTS` & `MANAGE_CUSTOMERS`**: Data privacy risks. Allows mass extraction or viewing of Personally Identifiable Information (PII). Restricted to `Administrator` and `Super Administrator`.

## Future Expansion Notes

The permission architecture is designed to gracefully support upcoming modules:

- **Future Staff Portal**: Built on `VIEW_STAFF_DASHBOARD`, granular access will be provided to modules (e.g., `UPDATE_PRODUCTION_STATUS` for tailors) without granting access to the entire Database Hub.
- **Future Production Module**: Will consume `MANAGE_TIMELINE`, `MANAGE_BATCHES`, and `UPDATE_PRODUCTION_STATUS`.
- **Future Notifications**: Will introduce a new `MANAGE_NOTIFICATIONS` permission, likely assigned to `Community Coordinator` and `Administrator`.
- **Future Finance**: Will rely on `APPROVE_PAYMENTS`, `VIEW_REPORTS`, and `EXPORT_REPORTS`, potentially introducing a new `Finance Officer` role.
