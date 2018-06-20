import Fcoin from 'fcoin-api';
import _ from 'lodash';

const Zero = 0.000000000000000000;
const ExchangeUnit = 500.0;				// 初始交易单元(usdt)，可自己调整

const OrderState = {
    submitted: 'submitted',
    partial_filled: 'partial_filled',
    partial_canceled: 'partial_canceled',
    filled: 'filled',
    canceled: 'canceled',
    pending_cancel: 'pending_cancel'
};

export class FCoinBot {
    constructor() {
        this.fcoin = new Fcoin({
            key: 'API.key',				// 自己修改
            secret: 'API.secret'		//  自己修改
        });

        this.btc = {
            currency: 'btc',
            available: Zero,
            frozen: Zero,
            balance: Zero
        };

        this.usdt = {
            currency: 'usdt',
            available: Zero,
            frozen: Zero,
            balance: Zero
        };

        this.order = {
            buyId: '',
            sellId: ''
        };


        this.last20PriceGaps = [];
        this.lastPrice = 0;

        this.totalUSDTFees = 0;
        this.totalBTCFees = 0;

        this.lastTime = 0;
    }

    averageGap(currentGap) {
        this.last20PriceGaps.push(currentGap);
        if (this.last20PriceGaps.length>20) {
            this.last20PriceGaps.splice(0, 1);
        }

        let total = this.last20PriceGaps.reduce((prev, curr) => {
            prev += Math.abs(curr);
            return prev;
        }, 0);

        return total/this.last20PriceGaps.length;
    }

    delay(ms) {
        return new Promise((resove, reject) => {
            setTimeout(()=> {
                resove();
            }, ms);
        })
    }

    async startJob() {
        while(true) {
            await this.delay(10000);
            await this.buyAndSellBTC();
        }
    }

    async buyAndSellBTC() {
        try {
            // let now = new Date().getTime();
            // if (this.lastTime>0 &&  now-this.lastTime < 10*1000) return;

            // 获取余额
            await this._getBalance();

            // 先撤销上次未成交的交易，并计算交易费用
            await this._cancelOrders();

            // 进行交易
            await this._doExchange();

            this.lastTime = new Date().getTime();
            console.log('################################', new Date())
        } catch (exception) {
            this.lastTime = new Date().getTime();
            console.warn(exception);
        }
    }

    async _doExchange() {
        let result = await this.fcoin.getTicker('btcusdt');
        if (result.status>0) {
            throw result.msg;
        }
        // console.log('getTicker', result)
        let buy1Price = result.data.ticker[2];
        let buy1Amount = result.data.ticker[3];
        let sell1Price = result.data.ticker[4];
        let sell1Amount = result.data.ticker[5];
        
        let buyPrice = +(buy1Price + 0.01).toFixed(2);
        let sellPrice = +(sell1Price - 0.01).toFixed(2);
        if (sellPrice<buyPrice) 
        {
            if (sell1Amount<buy1Amount) {
                sellPrice = buyPrice;
            } else {
                buyPrice = sellPrice;
            }
        } else {
            buyPrice = sellPrice = +((buyPrice+sellPrice)/2).toFixed(2);
        }

        let average = 0;
        if (this.lastPrice>0) {
            let priceGap = buyPrice-this.lastPrice;
            average = this.averageGap(priceGap);
            console.log(`LastPrice: ${this.lastPrice} CurrentPrice: ${buyPrice}, Price Gap: ${priceGap}, Average Gap: ${average}`);
        }
        this.lastPrice = buyPrice;
        

        // 价格平均变化指数过大时，停止交易
        if (average>2) {
            return;
        }

        
        // 帐户BTC有余额，则先卖出
        if (this.btc.available > 0.001) {
            let sellUnit = +((this.btc.available-0.0001).toFixed(4));
            // let result = await this.fcoin.createOrder('btcusdt', 'sell', 'limit', sellPrice.toString(), sellUnit.toString());
            // if (result.status>0) {
            //     console.warn(`创建sell订单(价格${sellPrice} 数量: ${sellUnit})失败，错误： ${result.msg}`);
            //     this.order.sellId = '';
            // } else {
            //     this.order.sellId = result.data;
            //     console.warn(`创建sell订单(价格${sellPrice} 数量: ${sellUnit})成功，交易ID： ${this.order.sellId}`);
            // }
            this.fcoin.createOrder('btcusdt', 'sell', 'limit', sellPrice.toString(), sellUnit.toString()).then(result => {
                if (result.status>0) {
                    console.warn(`创建sell订单(价格${sellPrice} 数量: ${sellUnit})失败，错误： ${result.msg}`);
                    this.order.sellId = '';
                } else {
                    this.order.sellId = result.data;
                    console.warn(`创建sell订单(价格${sellPrice} 数量: ${sellUnit})成功，交易ID： ${this.order.sellId}`);
                }
            });
            
        }

        let middleBalance = Math.floor((this.usdt.available + this.btc.available*sellPrice)/2);

        // 帐户usdt有余额，则进行购买
        if (this.usdt.available > 10) {
            let usdtUnit = Math.min(this.usdt.available, middleBalance, ExchangeUnit);
            let btcUnit = +((usdtUnit/buyPrice-0.0001).toFixed(4));
            let result = await this.fcoin.createOrder('btcusdt', 'buy', 'limit', buyPrice.toString(), btcUnit.toString());
            if (result.status>0) {
                console.warn(`创建buy订单(价格${buyPrice} 数量: ${btcUnit})失败，错误： ${result.msg}`);
                this.order.buyId = '';
            } else {
                this.order.buyId = result.data;
                console.warn(`创建buy订单(价格${buyPrice} 数量: ${btcUnit})成功，交易ID： ${this.order.buyId}`);
            }
            // this.fcoin.createOrder('btcusdt', 'buy', 'limit', buyPrice.toString(), btcUnit.toString()).then(result => {
            //     if (result.status>0) {
            //         console.warn(`创建buy订单(价格${buyPrice} 数量: ${btcUnit})失败，错误： ${result.msg}`);
            //         this.order.buyId = '';
            //     } else {
            //         this.order.buyId = result.data;
            //         console.warn(`创建buy订单(价格${buyPrice} 数量: ${btcUnit})成功，交易ID： ${this.order.buyId}`);
            //     }
            // });
            
        }
    }

    async _cancelOrders() {
     
        if (this.usdt.frozen > 0 || this.btc.frozen > 0) { 
            let result = await this.fcoin.getOrders('btcusdt', [OrderState.submitted, OrderState.partial_filled]);
            console.log('order list: ', result);

            if (!_.isEmpty(result.data)) {
                result.data.forEach(async (order) => {
                    if (order.side === 'buy') {
                    
                        let result = await this.fcoin.cancelOrder(order.id);
                        console.log(`撤销buy订单${order.id}, 返回`, result);
                    } else {
                  
                        let result = await this.fcoin.cancelOrder(order.id);
                        console.log(`撤销sell订单${order.id}, 返回`, result);
                    }
                });
            }
        }
    }

    async _getBalance() {
        const data = await this.fcoin.getBalance();
        if (data.status > 0) {
            throw data.msg;
        }
        const balances = data.data;

        if (!_.isEmpty(balances)) {
            let btc = balances.find(item => item.currency === 'btc');
            if (btc) {
                this.btc.available = +btc.available;
                this.btc.frozen = +btc.frozen;
                this.btc.balance = +btc.balance;
            }
    
            let usdt = balances.find(item => item.currency === 'usdt');
            if (usdt) {
                this.usdt.available = +usdt.available;
                this.usdt.frozen = +usdt.frozen;
                this.usdt.balance = +usdt.balance;
            }

            console.log(`usdt: 可用${this.usdt.available}, 冻结${this.usdt.frozen}, 总额${this.usdt.balance}`);
            console.log(`btc: 可用${this.btc.available}, 冻结${this.btc.frozen}, 总额${this.btc.balance}`);
        }
    }

}

export default FCoinBot;
