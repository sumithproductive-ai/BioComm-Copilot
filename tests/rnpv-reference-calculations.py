# Plain year-by-year arithmetic, written separately from rnpv-calc.ts.
def pv(x,r,t): return x/(1+r)**t
TAIL=[.6,.3,.15]
def line(name,total,*extra): print(f"{name}: {total:.2f}",*extra)
# A: minimal, no operating costs. 1-yr stage $100k, 50% gate, 10%, 1000 pts x 10% x $1000, ramp 1, 1 protected yr.
r=.10;P=.5
A=pv(-100000,r,1)+pv(100000*P,r,2)+sum(pv(100000*f*P,r,2+i+1) for i,f in enumerate(TAIL))
line("A",A)
# B: margins and tax. Same as A but 20% G2N, COGS 10, SGA 30, royalty 5, tax 20.
net=100000*.8; cash=lambda n: n*(1-.45)*(1-.20)
B=pv(-100000,r,1)+pv(cash(net)*P,r,2)+sum(pv(cash(net*f)*P,r,2+i+1) for i,f in enumerate(TAIL))
line("B",B,"cash",cash(net))
# C: full chronic. Stages: Ph2 2y $20m P .3, Ph3 3y $100m P .6, Filing 1y $5m P .9. POS .162.
# pop 200000, pen 2%-4% (3), list 40k-60k (50k), G2N 25, COGS 15, SGA 30, roy 5, tax 21, ramp 4, valuation 2026, LOE 2041, r 11%.
r=.11;POS=.3*.6*.9
C=0
for y in (1,2): C+=pv(-10e6,r,y)
for y in (3,4,5): C+=pv(-(100e6/3)*.3,r,y)
C+=pv(-5e6*(.3*.6),r,6)
T=6; n=2041-(2026+T)  # 9 protected years
peak=200000*.03*50000*.75
cash=lambda rev: rev*(1-.50)*(1-.21)
last=0
for k in range(1,n+1):
    rev=peak*min(k/4,1); last=rev
    C+=pv(cash(rev)*POS,r,T+k)
TV=sum(pv(cash(last*f)*POS,r,T+n+i+1) for i,f in enumerate(TAIL))
line("C",C+TV,"TV",round(TV),"peak",peak,"years",n)
# D: one-time. Stage 1.5y $30m gate .5 then 0.5y filing $2m gate .8. POS .4. pool 100000, new 5000/yr, pen 10, price 500k, G2N 10, COGS 20, SGA 25, roy 0, tax 20, ramp 2, excl 5 yrs from launch, r 12%.
r=.12;POS=.4
D=pv(-20e6,r,1)+pv(-10e6,r,1.5)+pv(-2e6*.5,r,2)
T=2;net=500000*.9;cash=lambda rev: rev*(1-.45)*(1-.20)
pts=[5000*.1*.5+100000*.1/2, 5000*.1*1+100000*.1/2, 500, 500, 500]
for k,p in enumerate(pts,1): D+=pv(cash(p*net)*POS,r,T+k)
TV=sum(pv(cash(500*net*f)*POS,r,T+5+i+1) for i,f in enumerate(TAIL))
line("D",D+TV,"TV",round(TV),"pts",pts)
# E: LOE before launch. Stage 3y $10m gate .5; LOE 2028, valuation 2026: 0 protected years, no commercial value.
line("E",sum(pv(-10e6/3,.1,y) for y in (1,2,3)))
# F: fractional LOE. As C but valuation 2026, stages sum 6.5y (Filing 1.5y), LOE 2041 => 8.5 protected yrs. Last year counts half.
r=.11;C2=0
for y in (1,2): C2+=pv(-10e6,r,y)
for y in (3,4,5): C2+=pv(-(100e6/3)*.3,r,y)
fil=5e6/1.5
C2+=pv(-fil*1*(.3*.6),r,6)+pv(-fil*.5*(.3*.6),r,6.5)
T=6.5;n=8.5;cash=lambda rev: rev*(1-.50)*(1-.21)
for k in range(1,9): C2+=pv(cash(peak*min(k/4,1))*(.3*.6*.9),r,T+k)
C2+=pv(cash(peak*.5)*(.3*.6*.9),r,T+8.5)
TV=sum(pv(cash(peak*f)*(.3*.6*.9),r,T+n+i+1) for i,f in enumerate(TAIL))
line("F",C2+TV,"TV",round(TV))
# Conservative scenario on C: penetration 2%, list price $40k, overall probability x 0.8 (split evenly across gates), rate 13%.
r=.13;m=.8**(1/3);g=[.3*m,.6*m,.9*m];POS=g[0]*g[1]*g[2]
tot=sum(pv(-10e6,r,y) for y in (1,2))+sum(pv(-(100e6/3)*g[0],r,y) for y in (3,4,5))+pv(-5e6*g[0]*g[1],r,6)
peak=200000*.02*40000*.75;cash=lambda v:v*.5*.79
for k in range(1,10): tot+=pv(cash(peak*min(k/4,1))*POS,r,6+k)
tot+=sum(pv(cash(peak*f)*POS,r,15+i+1) for i,f in enumerate(TAIL))
line("Conservative",tot)
