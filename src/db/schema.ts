/**
 * WordPress Integration / Database Readiness Schema
 * 
 * This file contains recommended relational database schemas for future 
 * WordPress integration or dedicated backend (e.g. PostgreSQL/MySQL).
 * It uses standard TypeScript definitions to map to future REST API resources
 * or WooCommerce Custom Post Types.
 */

// 1. Customers Table (Maps to WP_Users + WP_Usermeta)
export interface DbCustomer {
  id: string; // UUID or WP User ID
  wp_user_id?: number;
  name: string;
  email: string;
  phone?: string;
  passcode?: string;
  role: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

// 2. Measurements Table (1-to-1 with Customers)
export interface DbMeasurement {
  id: string;
  customer_id: string;
  height: number;
  weight: number;
  age: number;
  body_build: 'Slim' | 'Average' | 'Muscular' | 'Broad';
  fit_preference: 'Slim/Executive' | 'Standard' | 'Relaxed';
  neck: number;
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  sleeve: number;
  trouser_length: number;
  is_ai_estimated: boolean;
  updated_at: string;
}

// 3. Batches / Custom Groups Table (Maps to WP Custom Post Type 'Batch')
export interface DbBatch {
  id: string;
  name: string;
  occasion: string;
  description: string;
  country: string;
  city: string;
  preferred_delivery_month: string;
  expected_participants: number;
  max_participants: number;
  visibility: 'Private' | 'Public';
  status: 'Draft' | 'Open' | 'Almost Full' | 'Full' | 'Closed' | 'Locked' | 'Completed';
  organizer_id: string;
  closing_date: string; // ISO DateTime
  delivery_window: string;
  pickup_location: string;
  created_at: string;
}

// 4. Orders Table (Maps to WooCommerce Orders)
export interface DbOrder {
  id: string;
  customer_id: string;
  batch_id?: string;
  status: 'Drafting' | 'Cutting' | 'Sewing' | 'Finishing' | 'Quality Control' | 'Ready' | 'Delivered';
  stage: number;
  subtotal: number;
  deposit_paid: number;
  remaining_balance: number;
  payment_method: string;
  transaction_id?: string;
  tracking_id?: string;
  created_at: string;
  updated_at: string;
}

// 5. Order Items Table (Maps to WooCommerce Order Line Items)
export interface DbOrderItem {
  id: string;
  order_id: string;
  style_id: string;
  fabric_id: string;
  design_customizations: any; // JSONB column
  price: number;
}
