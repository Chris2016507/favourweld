import type { Request, Response } from "express";

type D1 = { prepare(sql: string): { bind(...values: unknown[]): { first<T=Record<string,unknown>>(): Promise<T|null>; all<T=Record<string,unknown>>(): Promise<{results:T[]}>; run(): Promise<unknown> } } };

const clean=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
const fail=(res:Response,status:number,error:string)=>res.status(status).json({success:false,error});

export function registerMarketplaceRoutes(app:any,db:D1):void {
 app.get("/api/marketplace/products",async(req:Request,res:Response)=>{
  try{
   const q=clean(req.query?.q,120), category=clean(req.query?.category,80);
   const limit=Math.min(Math.max(Number(req.query?.limit??30),1),100), offset=Math.max(Number(req.query?.offset??0),0);
   const rows=await db.prepare("SELECT p.id,p.name,p.description,p.category,p.price,p.moq,p.stock,p.image_url,p.status,p.created_at,s.id AS seller_id,s.store_name,s.location FROM marketplace_products p JOIN marketplace_sellers s ON s.id=p.seller_id WHERE p.status='active' AND (?='' OR p.name LIKE ? OR p.description LIKE ?) AND (?='' OR p.category=?) ORDER BY p.created_at DESC LIMIT ? OFFSET ?").bind(q,"%"+q+"%","%"+q+"%",category,category,limit,offset).all();
   return res.json({success:true,products:rows.results,limit,offset});
  }catch{return fail(res,500,"Products could not be loaded.")}
 });
 app.get("/api/marketplace/stores",async(_req:Request,res:Response)=>{
  try{const rows=await db.prepare("SELECT id,store_name,description,location,phone,verified,created_at FROM marketplace_sellers WHERE status='active' ORDER BY verified DESC,created_at DESC LIMIT 100").bind().all();return res.json({success:true,stores:rows.results});}catch{return fail(res,500,"Stores could not be loaded.")}
 });
 app.post("/api/marketplace/sellers",async(req:Request,res:Response)=>{
  try{
   const userId=Number(req.body?.user_id),storeName=clean(req.body?.store_name,160),description=clean(req.body?.description,1000),location=clean(req.body?.location,180),phone=clean(req.body?.phone,30);
   if(!Number.isSafeInteger(userId)||userId<1||storeName.length<2)return fail(res,400,"user_id and store_name are required.");
   const existing=await db.prepare("SELECT id FROM marketplace_sellers WHERE user_id=?").bind(userId).first();
   if(existing)return fail(res,409,"This user already has a seller store.");
   const seller=await db.prepare("INSERT INTO marketplace_sellers(user_id,store_name,description,location,phone,status,verified) VALUES(?,?,?,?,?,'pending',0) RETURNING id,store_name,status,verified,created_at").bind(userId,storeName,description||null,location||null,phone||null).first();
   return res.status(201).json({success:true,seller});
  }catch{return fail(res,500,"Seller store could not be created.")}
 });
 app.post("/api/marketplace/products",async(req:Request,res:Response)=>{
  try{
   const sellerId=Number(req.body?.seller_id),name=clean(req.body?.name,180),description=clean(req.body?.description,2000),category=clean(req.body?.category,80),price=Number(req.body?.price),moq=Number(req.body?.moq??1),stock=Number(req.body?.stock??0),imageUrl=clean(req.body?.image_url,1000);
   if(!Number.isSafeInteger(sellerId)||sellerId<1||name.length<2||!Number.isFinite(price)||price<=0||!Number.isSafeInteger(moq)||moq<1||!Number.isSafeInteger(stock)||stock<0)return fail(res,400,"Valid seller, product name, price, MOQ and stock are required.");
   const seller=await db.prepare("SELECT id FROM marketplace_sellers WHERE id=? AND status='active'").bind(sellerId).first();
   if(!seller)return fail(res,403,"Seller store is not active.");
   const product=await db.prepare("INSERT INTO marketplace_products(seller_id,name,description,category,price,moq,stock,image_url,status) VALUES(?,?,?,?,?,?,?,?,'active') RETURNING id,seller_id,name,description,category,price,moq,stock,image_url,status,created_at").bind(sellerId,name,description||null,category||null,price,moq,stock,imageUrl||null).first();
   return res.status(201).json({success:true,product});
  }catch{return fail(res,500,"Product could not be created.")}
 });
 app.patch("/api/marketplace/products/:id",async(req:Request,res:Response)=>{
  try{
   const id=Number(req.params.id),status=clean(req.body?.status,20),price=req.body?.price===undefined?null:Number(req.body.price),stock=req.body?.stock===undefined?null:Number(req.body.stock);
   if(!Number.isSafeInteger(id)||id<1)return fail(res,400,"Invalid product id.");
   if(status&&!["active","paused","rejected"].includes(status))return fail(res,400,"Invalid product status.");
   if(price!==null&&(!Number.isFinite(price)||price<=0))return fail(res,400,"Invalid price.");
   if(stock!==null&&(!Number.isSafeInteger(stock)||stock<0))return fail(res,400,"Invalid stock.");
   await db.prepare("UPDATE marketplace_products SET status=COALESCE(NULLIF(?,' '),status),price=COALESCE(?,price),stock=COALESCE(?,stock),updated_at=datetime('now') WHERE id=?").bind(status,price,stock,id).run();
   const product=await db.prepare("SELECT * FROM marketplace_products WHERE id=?").bind(id).first();
   if(!product)return fail(res,404,"Product not found.");
   return res.json({success:true,product});
  }catch{return fail(res,500,"Product could not be updated.")}
 });
 app.post("/api/marketplace/orders",async(req:Request,res:Response)=>{
  try{
   const buyerId=Number(req.body?.buyer_id),items=req.body?.items;
   if(!Number.isSafeInteger(buyerId)||buyerId<1||!Array.isArray(items)||items.length<1||items.length>50)return fail(res,400,"buyer_id and at least one order item are required.");
   let total=0;const checked:any[]=[];
   for(const item of items){
    const productId=Number(item?.product_id),quantity=Number(item?.quantity);
    if(!Number.isSafeInteger(productId)||productId<1||!Number.isSafeInteger(quantity)||quantity<1)return fail(res,400,"Invalid order item.");
    const p=await db.prepare("SELECT id,seller_id,price,moq,stock FROM marketplace_products WHERE id=? AND status='active'").bind(productId).first<any>();
    if(!p||quantity<p.moq||quantity>p.stock)return fail(res,409,"A product is unavailable or does not meet its minimum order quantity.");
    total+=Number(p.price)*quantity;checked.push({productId,quantity,unitPrice:Number(p.price),sellerId:p.seller_id});
   }
   const orderRef="FW-ORD-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,6).toUpperCase();
   const order=await db.prepare("INSERT INTO marketplace_orders(order_number,buyer_id,total,currency,status,payment_status) VALUES(?,?,?,'KES','pending','unpaid') RETURNING id,order_number,total,currency,status,payment_status,created_at").bind(orderRef,buyerId,total).first<any>();
   if(!order?.id)return fail(res,500,"Order could not be created.");
   for(const item of checked){
    await db.prepare("INSERT INTO marketplace_order_items(order_id,product_id,seller_id,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?)").bind(order.id,item.productId,item.sellerId,item.quantity,item.unitPrice,item.quantity*item.unitPrice).run();
    await db.prepare("UPDATE marketplace_products SET stock=stock-? WHERE id=?").bind(item.quantity,item.productId).run();
   }
   return res.status(201).json({success:true,order});
  }catch{return fail(res,500,"Order could not be created.")}
 });
}