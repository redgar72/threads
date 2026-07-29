#!/bin/sh
set -e

echo "Waiting for database..."
until node -e "const {Client}=require('pg'); const c=new Client({connectionString:process.env.DATABASE_URL}); c.connect().then(()=>c.end()).catch(e=>{console.error(e.message); process.exit(1)})"; do
  sleep 1
done

echo "Applying migrations..."
npx prisma migrate deploy
npx prisma generate

echo "Starting Next.js..."
exec npm run dev -- --hostname 0.0.0.0 --port 3000