require('babel-core/register');
const Fcoin = require('fcoin-api');
const _ = require('lodash');
const FCoinBot = require('./fcoinbot').default;

// //Important
// let fcoin = new Fcoin({
//     key: 'f0f1441586ec4316a37591ae14a546ef',
//     secret: 'a7073c4ce391407d8821739797a78769'
// })

// /**
//  * 行情接口(ticker)
//  * @param {交易对} symbol 
//  */
// fcoin.getTicker('btcusdt').then(data => {
//     console.log('btcusdt: ', data);
// })

// /**
//  * 查询账户资产
//  */
// fcoin.getBalance().then(data => {
//     console.log('my account balance: ', data);
// })

let fcoinBot = new FCoinBot();

// fcoinBot.buyAndSellBTC().then(() => {
//     console.log('--------------------------------------------------------------------')
// })

// setInterval(() => {
//     fcoinBot.buyAndSellBTC().then(() => {
//         console.log('--------------------------------------------------------------------')
//     })
// }, 10000);

fcoinBot.startJob().then(() => {})
