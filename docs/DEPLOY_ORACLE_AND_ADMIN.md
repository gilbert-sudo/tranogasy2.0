# TranoGasy — $0/mo Always-On Deployment Guide (Oracle Cloud + Cloudflare Pages + Zero Trust)

Architecture:
- **Backend + 24/7 Scraper (every 30 min, zero sleep):** Oracle Cloud Always Free ARM VM (`tranogasy 2.0/backend`)
- **Private Admin PWA:** Cloudflare Pages (`tranogasy 2.0/admin`) locked behind **Cloudflare Zero Trust Access** (free up to 50 users — public users cannot even see the admin login page)
- **User App:** Existing `tranogasy 2.0/frontend` (zero admin code or routes included)

---

## 1. Oracle Cloud Always Free VM (Backend 24/7 — $0/mo)

1. Sign up at [cloud.oracle.com](https://www.oracle.com/cloud/free/) with your valid card (verification only, $0 charged).
   - *Tip:* If ARM capacity says "Out of host capacity", upgrade the account to **Pay As You Go** (still $0 as long as you stay within Always Free limits: ≤ 4 OCPU ARM + ≤ 24 GB RAM + ≤ 200 GB boot volume).
2. Create a **Compute Instance**:
   - **Image:** Ubuntu 24.04 Minimal (aarch64)
   - **Shape:** `VM.Standard.A1.Flex` — **2 OCPU, 12 GB RAM** (or up to 4 OCPU / 24 GB RAM, still $0)
   - Download the SSH private key (`.key`)
3. Open HTTP/HTTPS ports in Oracle VCN:
   - Go to **Instance → Subnet → Default Security List → Add Ingress Rules**:
     - Source CIDR `0.0.0.0/0`, TCP Destination Ports `80,443`
4. Point your API domain DNS (e.g. `api.tranogasy.mg`) with an **A Record** to the VM's Public IP (in Cloudflare DNS, start with **DNS Only / Grey Cloud** until Caddy issues the SSL cert, then you can enable orange cloud with SSL mode **Full (Strict)**).

### Install Docker & Start Backend on the VM

```bash
ssh -i your-oracle.key ubuntu@<VM_PUBLIC_IP>

# Open Ubuntu firewall for 80/443
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Install Docker + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Clone repo & enter backend
git clone -b dev https://github.com/gilbert-sudo/tranogasy2.0.git tranogasy
cd tranogasy/backend

# Create .env (copy your production env vars + add the 3 security vars below)
nano .env
```

Required new security variables in `backend/.env`:
```env
AUTH_TOKEN_SECRET=<generate-64-char-random-hex>
ADMIN_ACCESS_SECRET=<generate-64-char-random-hex>
API_DOMAIN=api.tranogasy.mg
CORS_ORIGINS=https://tranogasy.mg,https://admin.tranogasy.mg,capacitor://localhost,http://localhost
```
*(Generate secrets locally with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)*

Start 24/7 with automatic HTTPS:
```bash
docker compose up -d --build
curl https://api.tranogasy.mg/health
```

---

## 2. Deploy Private Admin PWA on Cloudflare Pages ($0/mo)

1. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Select your repo and configure:
   - **Root directory:** `tranogasy 2.0/admin`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Add **Environment Variables** in Cloudflare Pages:
   - `VITE_API_URL` = `https://api.tranogasy.mg/api`
   - `VITE_PUBLIC_SITE_URL` = `https://tranogasy.mg`
   - `VITE_ADMIN_ACCESS_SECRET` = *(exact same value as `ADMIN_ACCESS_SECRET` in `backend/.env`)*
4. Attach a custom domain (e.g. `admin.tranogasy.mg`).

---

## 3. Hide Admin Completely with Cloudflare Zero Trust Access ($0/mo)

1. Open **Cloudflare Zero Trust** (`one.dash.cloudflare.com`) → **Access → Applications → Add an application → Self-hosted**.
2. Set **Application domain:** `admin.tranogasy.mg` (or your `*.pages.dev` domain).
3. Create an **Allow Policy**:
   - **Include → Emails:** add ONLY your own email(s) (e.g. `yourname@gmail.com`).
4. Save! Now anyone who visits `admin.tranogasy.mg` hits Cloudflare's OTP login wall and **never even downloads the Admin app or sees your admin login screen**.

---

## 4. Update Consumer Frontend API URL

In `tranogasy 2.0/frontend/.env.production`, point `NEXT_PUBLIC_API_URL` to `https://api.tranogasy.mg/api`.
