const request=require('supertest');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const app=require('../src/app');
const db=require('../src/config/db');
const {mockQueryResult}=require('./helpers/db-mock');
const {generateTestToken}=require('./helpers/auth-helper');
jest.mock('../src/config/db');
const owner={id:1,email:'owner@alzohra.com',full_name:'Owner User',role:'owner',status:'active'};
const payload={email:'newuser@example.com',password:'plainpassword',full_name:'New User',role:'staff'};
let client;
beforeEach(async()=>{
  jest.clearAllMocks();db.query.mockReset().mockResolvedValue(mockQueryResult([owner]));
  client=await db.pool.connect();client.query.mockReset().mockImplementation(async(sql,p)=>{
    if(sql.includes('SELECT id FROM users'))return mockQueryResult([]);
    if(sql.includes('SELECT MAX(code)'))return mockQueryResult([{max_code:1050}]);
    if(sql.includes('INSERT INTO users'))return mockQueryResult([{id:4,email:p[0],full_name:p[2],role:p[3]}]);
    return mockQueryResult([]);
  });
});
const register=(body=payload,token=generateTestToken({role:'owner'}))=>request(app).post('/api/auth/register').set('Authorization','Bearer '+token).send(body);
describe('Auth Module',()=>{
  for(const missing of ['email','password'])test('login requires '+missing,async()=>{
    const body={email:owner.email,password:'owner123'};delete body[missing];const r=await request(app).post('/api/auth/login').send(body);
    expect(r.statusCode).toBe(400);expect(r.body.error).toBe('Email and password required');
  });
  test('nonexistent user cannot log in',async()=>{db.query.mockResolvedValue(mockQueryResult([]));const r=await request(app).post('/api/auth/login').send({email:owner.email,password:'bad'});expect(r.statusCode).toBe(401);expect(r.body.error).toBe('Invalid credentials');});
  test('incorrect password cannot log in',async()=>{db.query.mockResolvedValue(mockQueryResult([{...owner,password_hash:await bcrypt.hash('correctpassword',4)}]));const r=await request(app).post('/api/auth/login').send({email:owner.email,password:'owner123'});expect(r.statusCode).toBe(401);});
  test('real hashed password logs in and excludes the hash',async()=>{
    db.query.mockResolvedValue(mockQueryResult([{...owner,password_hash:await bcrypt.hash('owner123',4)}]));
    const r=await request(app).post('/api/auth/login').send({email:owner.email,password:'owner123'});expect(r.statusCode).toBe(200);expect(r.body.user).toEqual({id:1,email:owner.email,full_name:owner.full_name,role:'owner'});expect(r.body.user).not.toHaveProperty('password_hash');expect(r.body.token).toEqual(expect.any(String));
  });
  test('successful login issues a verifiable current-role JWT',async()=>{
    const manager={...owner,id:2,email:'manager@alzohra.com',role:'manager',password_hash:await bcrypt.hash('manager123',4)};db.query.mockResolvedValue(mockQueryResult([manager]));
    const r=await request(app).post('/api/auth/login').send({email:manager.email,password:'manager123'});expect(r.statusCode).toBe(200);expect(jwt.verify(r.body.token,process.env.JWT_SECRET)).toEqual(expect.objectContaining({id:2,email:manager.email,role:'manager'}));
  });
  test('inactive account cannot log in with a correct password',async()=>{
    db.query.mockResolvedValue(mockQueryResult([{...owner,status:'inactive',password_hash:await bcrypt.hash('owner123',4)}]));expect((await request(app).post('/api/auth/login').send({email:owner.email,password:'owner123'})).statusCode).toBe(403);
  });
  test('register requires authentication',async()=>{expect((await request(app).post('/api/auth/register').send(payload)).statusCode).toBe(401);});
  test('register requires all fields',async()=>{const r=await register({email:payload.email});expect(r.statusCode).toBe(400);expect(r.body.error).toBe('All fields required');});
  test('register rejects an existing email and rolls back',async()=>{
    client.query.mockImplementation(async()=>mockQueryResult([{id:1}]));const r=await register();expect(r.statusCode).toBe(400);expect(r.body.error).toBe('Email already exists');expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
  test('register commits user and wallet through the pooled client',async()=>{
    const r=await register();expect(r.statusCode).toBe(200);expect(r.body.success).toBe(true);expect(r.body.user.email).toBe(payload.email);expect(r.body.user).not.toHaveProperty('password_hash');expect(client.query).toHaveBeenCalledWith('COMMIT');expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chart_of_accounts'),[1051,'Wallet - New User']);
  });
  test('register stores a real bcrypt hash',async()=>{
    const r=await register();expect(r.statusCode).toBe(200);const insert=client.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO users'));expect(insert).toBeDefined();const hash=insert[1][1];expect(hash).not.toBe(payload.password);expect(await bcrypt.compare(payload.password,hash)).toBe(true);
  });
  test('current manager cannot register an owner even with an old owner token',async()=>{
    db.query.mockResolvedValue(mockQueryResult([{...owner,role:'manager'}]));expect((await register({...payload,role:'owner'})).statusCode).toBe(403);
  });
  test('health responds with timestamp',async()=>{const r=await request(app).get('/health');expect(r.statusCode).toBe(200);expect(r.body.status).toBe('ok');expect(r.body.timestamp).toEqual(expect.any(String));});
});
