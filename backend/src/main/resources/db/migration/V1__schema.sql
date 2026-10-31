-- Money is whole rupiah (bigint). Dates are Asia/Jakarta calendar dates.

create table users (
  id            bigserial primary key,
  email         text not null unique check (email = lower(email)),
  password_hash text not null,
  name          text not null,
  phone         text not null default '',
  role          text not null check (role in ('CUSTOMER', 'PHARMACIST')),
  created_at    timestamptz not null default now()
);

create table categories (
  id       serial primary key,
  slug     text not null unique,
  name     text not null,
  position int not null default 0
);

-- Indonesian classes: BEBAS (green dot), BEBAS_TERBATAS (blue dot, limited quantity), KERAS (red K, prescription only).
create table products (
  id            bigserial primary key,
  slug          text not null unique,
  name          text not null,
  generic_name  text not null,
  form          text not null,
  strength      text not null default '',
  pack          text not null,
  category_id   int not null references categories,
  drug_class    text not null check (drug_class in ('BEBAS', 'BEBAS_TERBATAS', 'KERAS', 'ALKES')),
  price         bigint not null check (price > 0),
  max_per_order int check (max_per_order > 0),
  image         text not null,
  description   text not null,
  dosage        text not null default '',
  warnings      text not null default '',
  active        boolean not null default true
);
create index products_category on products (category_id);

create table batches (
  id            bigserial primary key,
  product_id    bigint not null references products,
  batch_no      text not null,
  expiry_date   date not null,
  qty_received  int not null check (qty_received > 0),
  qty_available int not null check (qty_available >= 0 and qty_available <= qty_received),
  received_at   timestamptz not null default now(),
  received_by   bigint references users,
  unique (product_id, batch_no)
);
create index batches_fefo on batches (product_id, expiry_date, id) where qty_available > 0;

create table prescriptions (
  id           bigserial primary key,
  owner_id     bigint not null references users,
  storage_key  text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes   int not null check (size_bytes > 0),
  sha256       text not null,
  doctor_name  text not null default '',
  uploaded_at  timestamptz not null default now()
);

create sequence order_number_seq;

create table orders (
  id               bigserial primary key,
  number           text not null unique,
  customer_id      bigint not null references users,
  status           text not null check (status in ('AWAITING_REVIEW', 'AWAITING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED')),
  recipient        text not null,
  phone            text not null,
  address          text not null,
  city             text not null,
  postal_code      text not null,
  subtotal         bigint not null,
  shipping_fee     bigint not null,
  total            bigint not null,
  prescription_id  bigint references prescriptions,
  review_note      text not null default '',
  reviewed_by      bigint references users,
  reviewed_at      timestamptz,
  tracking_no      text not null default '',
  idempotency_key  uuid not null unique,
  created_at       timestamptz not null default now(),
  payment_due_at   timestamptz,
  paid_at          timestamptz
);
create index orders_customer on orders (customer_id, created_at desc);
create index orders_status on orders (status, created_at);

create table order_items (
  id          bigserial primary key,
  order_id    bigint not null references orders on delete cascade,
  product_id  bigint not null references products,
  name        text not null,
  drug_class  text not null,
  unit_price  bigint not null,
  qty         int not null check (qty > 0),
  line_total  bigint not null
);

-- Which batches each line was filled from, so a cancellation returns stock to the same batches.
create table allocations (
  id            bigserial primary key,
  order_item_id bigint not null references order_items on delete cascade,
  batch_id      bigint not null references batches,
  qty           int not null check (qty > 0)
);

-- Timeline of every status change and review, with who did it.
create table order_events (
  id         bigserial primary key,
  order_id   bigint not null references orders on delete cascade,
  at         timestamptz not null default now(),
  actor_id   bigint references users,
  type       text not null,
  note       text not null default ''
);
create index order_events_order on order_events (order_id, at);

-- Append-only stock ledger: receipts, sales, returns and write-offs.
create table stock_movements (
  id         bigserial primary key,
  batch_id   bigint not null references batches,
  delta      int not null check (delta <> 0),
  reason     text not null check (reason in ('RECEIVED', 'ALLOCATED', 'RELEASED', 'WRITTEN_OFF')),
  order_id   bigint references orders,
  actor_id   bigint references users,
  at         timestamptz not null default now()
);
create index stock_movements_batch on stock_movements (batch_id, at);
