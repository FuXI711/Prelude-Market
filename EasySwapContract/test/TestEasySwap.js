// 导入测试框架断言库，用于验证测试结果
const { expect } = require("chai")
// 导入hardhat的ethers和upgrades模块，用于与以太坊交互和代理合约部署
const { ethers, upgrades } = require("hardhat")
// 导入toBn函数，用于将字符串转换为BigNumber格式（处理精度问题）
const { toBn } = require("evm-bn")
// 导入订单相关的枚举值：Side（买卖方向）和SaleKind（销售类型）
const { Side, SaleKind } = require("./common")
// 导入数学计算库，用于指数运算
const { exp } = require("@prb/math")

// 声明全局变量：测试账户和合约实例
let owner, addr1, addr2, addrs  // 测试账户：owner是合约部署者，addr1/addr2是测试用户
let esVault, esDex, testERC721, testLibOrder  // 合约实例：金库、订单簿、测试NFT、测试库

// 定义常量：零地址（用于表示无效地址）
const AddressZero = "0x0000000000000000000000000000000000000000";
// 定义常量：32字节的零值（用于表示无效的订单哈希）
const Byte32Zero = "0x0000000000000000000000000000000000000000000000000000000000000000";
// 定义常量：uint128的最大值（用于表示订单已取消状态）
const Uint128Max = toBn("340282366920938463463.374607431768211455");
// 定义常量：uint256的最大值（用于表示订单已取消状态）
const Uint256Max = toBn("115792089237316195423570985008687907853269984665640564039457.584007913129639935");


// 定义测试套件：EasySwap合约的完整功能测试
describe("EasySwap Test", function () {
    // 在每个测试用例执行前的设置函数
    beforeEach(async function () {
        // 获取测试账户：owner是合约部署者，addr1/addr2是测试用户，addrs是其他账户
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        // console.log("owner: ", owner.address)

        // 获取合约工厂实例，用于部署合约
        esVault = await ethers.getContractFactory("EasySwapVault")  // 金库合约工厂
        esDex = await ethers.getContractFactory("EasySwapOrderBook")  // 订单簿合约工厂
        testERC721 = await ethers.getContractFactory("TestERC721")  // 测试NFT合约工厂
        testLibOrder = await ethers.getContractFactory("LibOrderTest")  // 测试库合约工厂

        // 部署测试合约：直接部署（非代理合约）
        testLibOrder = await testLibOrder.deploy()  // 部署订单哈希计算测试合约
        testERC721 = await testERC721.deploy()  // 部署测试用NFT合约
        // 部署代理合约：使用OpenZeppelin的代理模式，支持合约升级
        esVault = await upgrades.deployProxy(esVault, { initializer: 'initialize' });
        // await esVault.waitForDeployment();
        // console.log("esVault deployed to:", await esVault.getAddress());

        // 设置订单簿合约的初始化参数
        newProtocolShare = 200;  // 协议费用：200表示2%（200/10000）
        newESVault = esVault.address  // 金库合约地址
        EIP712Name = "EasySwapOrderBook"  // EIP712域名名称（用于签名验证）
        EIP712Version = "1"  // EIP712版本号
        // 部署订单簿代理合约，传入初始化参数
        esDex = await upgrades.deployProxy(esDex, [newProtocolShare, newESVault, EIP712Name, EIP712Version], { initializer: 'initialize' });
        // await esDex.waitForDeployment();
        // console.log("esDex deployed to:", await esDex.getAddress());

        // 设置NFT合约地址变量
        nft = testERC721.address
        // 为owner账户铸造12个NFT代币（tokenId从0到11）
        await testERC721.mint(owner.address, 0)  // 铸造tokenId为0的NFT
        await testERC721.mint(owner.address, 1)  // 铸造tokenId为1的NFT
        await testERC721.mint(owner.address, 2)  // 铸造tokenId为2的NFT
        await testERC721.mint(owner.address, 3)  // 铸造tokenId为3的NFT
        await testERC721.mint(owner.address, 4)  // 铸造tokenId为4的NFT
        await testERC721.mint(owner.address, 5)  // 铸造tokenId为5的NFT
        await testERC721.mint(owner.address, 6)  // 铸造tokenId为6的NFT
        await testERC721.mint(owner.address, 7)  // 铸造tokenId为7的NFT
        await testERC721.mint(owner.address, 8)  // 铸造tokenId为8的NFT
        await testERC721.mint(owner.address, 9)  // 铸造tokenId为9的NFT
        await testERC721.mint(owner.address, 10)  // 铸造tokenId为10的NFT
        await testERC721.mint(owner.address, 11)  // 铸造tokenId为11的NFT
        // 授权金库合约可以转移owner的所有NFT（用于订单创建时转移NFT到金库）
        testERC721.setApprovalForAll(esVault.address, true)
        // testERC721.setApprovalForAll(esDex.address, true)

        // 在金库合约中设置订单簿合约地址，建立两个合约之间的关联
        await esVault.setOrderBook(esDex.address)
    })

    // 测试套件：验证合约初始化是否成功
    //describe.only("should initialize successfully", async () => { 加个only可以只跑这一个测试
    describe("should initialize successfully", async () => {
        // 测试用例：验证EIP712域名信息是否正确设置
        it("should initialize successfully", async () => {
            // 获取订单簿合约的EIP712域名信息
            info = await esDex.eip712Domain();
            // 验证域名名称是否正确
            expect(info.name).to.equal(EIP712Name)
            // 验证版本号是否正确
            expect(info.version).to.equal(EIP712Version)
        })
    })

    // 测试套件：验证订单创建功能
    describe("should make order successfully", async () => {
        // 测试用例：成功创建挂单/卖单
        it("should make list/sell order successfully", async () => {
            // 设置订单过期时间：当前时间+100000秒（约27.8小时后过期）
            const now = parseInt(new Date() / 1000) + 100000
            const salt = 1;  // 随机盐值，用于生成唯一订单哈希
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            const nftAmount = 1;  // NFT数量（ERC721固定为1）
            // 构建挂单订单对象
            const order = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order];  // 将订单放入数组

            // 使用callStatic模拟调用，获取订单哈希（不实际执行交易），为了测试该调用是否成功
            orderKeys = await esDex.callStatic.makeOrders(orders)
            // 验证返回的订单哈希不为零值
            expect(orderKeys[0]).to.not.equal(Byte32Zero)

            // tx = await esDex.makeOrders(orders)
            // txRec = await tx.wait()
            // console.log("txRec: ", txRec.logs)

            // 实际执行创建订单交易，验证是否发出LogMake事件
            await expect(await esDex.makeOrders(orders))
                .to.emit(esDex, "LogMake")

            // 使用测试库计算订单哈希
            const orderHash = await testLibOrder.getOrderHash(order)
            // console.log("orderHash: ", orderHash)

            // 从合约中查询订单信息
            dbOrder = await esDex.orders(orderHash)
            // console.log("dbOrder: ", dbOrder)
            // 验证订单创建者地址是否正确
            expect(dbOrder.order.maker).to.equal(owner.address)
            // 验证NFT是否已转移到金库合约
            expect(await testERC721.ownerOf(0)).to.equal(esVault.address)
        })

        // 测试用例：成功创建挂单并返回订单哈希
        it("should make list/sell order and return orders successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建挂单订单对象
            const order = {
                side: Side.List,  // 订单方向：挂单
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order];  // 将订单放入数组

            // 使用callStatic模拟调用，获取订单哈希（不实际执行交易）
            orderKeys = await esDex.callStatic.makeOrders(orders)
            // 验证返回的订单哈希不为零值
            expect(orderKeys[0]).to.not.equal(Byte32Zero)

        })

        // 测试用例：成功创建买单/竞价单
        it("should make bid/buy order successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建买单订单对象
            const order = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order];  // 将订单放入数组

            // 使用callStatic模拟调用，获取订单哈希（不实际执行交易）
            orderKeys = await esDex.callStatic.makeOrders(orders, { value: toBn("0.02") })
            // 验证返回的订单哈希不为零值
            expect(orderKeys[0]).to.not.equal(Byte32Zero)

            // 实际执行创建买单交易，验证ETH余额变化（用户支付0.01 ETH到金库）
            await expect(await esDex.makeOrders(orders, { value: toBn("0.02") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.01"), toBn("0.01")]);

            // 使用测试库计算订单哈希
            const orderHash = await testLibOrder.getOrderHash(order)
            // console.log("orderHash: ", orderHash)

            // 从合约中查询订单信息
            dbOrder = await esDex.orders(orderHash)
            // console.log("dbOrder: ", dbOrder)
            // 验证订单创建者地址是否正确
            expect(dbOrder.order.maker).to.equal(owner.address)
        })

        // 测试用例：成功创建双向订单（挂单和买单）
        it("should make two side order successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建挂单订单对象
            const listOrder = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建买单订单对象
            const bidOrder = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [listOrder, bidOrder];  // 将两个订单放入数组

            // 使用callStatic模拟调用，获取订单哈希（不实际执行交易）
            orderKeys = await esDex.callStatic.makeOrders(orders, { value: toBn("0.02") })
            // 验证返回的两个订单哈希都不为零值
            expect(orderKeys[0]).to.not.equal(Byte32Zero)
            expect(orderKeys[1]).to.not.equal(Byte32Zero)

            // 实际执行创建双向订单交易，验证ETH余额变化
            await expect(await esDex.makeOrders(orders, { value: toBn("0.02") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.01"), toBn("0.01")]);

            // 验证挂单订单信息
            const listOrderHash = await testLibOrder.getOrderHash(listOrder)
            dbOrder = await esDex.orders(listOrderHash)
            expect(dbOrder.order.maker).to.equal(owner.address)
            // 验证NFT已转移到金库合约
            expect(await testERC721.ownerOf(0)).to.equal(esVault.address)

            // 验证买单订单信息
            const bidOrderHash = await testLibOrder.getOrderHash(bidOrder)
            dbOrder2 = await esDex.orders(bidOrderHash)
            expect(dbOrder2.order.maker).to.equal(owner.address)
        })
    })

    // 测试套件：验证订单取消功能
    describe("should cancel order successfully", async () => {
        // 测试用例：成功取消挂单
        it("should cancel list order successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建挂单订单对象
            const order = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order];  // 将订单放入数组


            // 实际执行创建订单交易，验证是否发出LogMake事件
            await expect(await esDex.makeOrders(orders))
                .to.emit(esDex, "LogMake")

            // 使用测试库计算订单哈希
            const orderHash = await testLibOrder.getOrderHash(order)
            // console.log("orderHash: ", orderHash)

            // 从合约中查询订单信息
            dbOrder = await esDex.orders(orderHash)
            // console.log("dbOrder: ", dbOrder)
            // 验证订单创建者地址是否正确
            expect(dbOrder.order.maker).to.equal(owner.address)

            // 使用callStatic模拟调用取消订单，验证返回成功状态
            successes = await esDex.callStatic.cancelOrders([orderHash])
            expect(successes[0]).to.equal(true)

            // tx = await esDex.cancelOrders([orderHash])
            // txRec = await tx.wait()
            // console.log("txRec: ", txRec.logs)

            // 实际执行取消订单交易，验证是否发出LogCancel事件
            await expect(await esDex.cancelOrders([orderHash]))
                .to.emit(esDex, "LogCancel")

            // 验证订单已取消：filledAmount应该等于最大值（表示已取消状态）
            stat = await esDex.filledAmount(orderHash)
            expect(stat).to.equal(Uint256Max)
        })

        // 测试用例：成功取消买单
        it("should cancel bid order successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建买单订单对象（数量为5个）
            const order = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 5],  // NFT信息：[代币ID, 合约地址, 数量5]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order];  // 将订单放入数组

            // 注释掉的代码：验证是否发出LogMake事件
            // await expect(await esDex.makeOrders(orders, { value: toBn("0.05") }))
            //     .to.emit(esDex, "LogMake")

            // 实际执行创建买单交易，验证ETH余额变化（用户支付0.05 ETH到金库）
            await expect(await esDex.makeOrders(orders, { value: toBn("0.07") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.05"), toBn("0.05")]);

            // 使用测试库计算订单哈希
            const orderHash = await testLibOrder.getOrderHash(order)
            // console.log("orderHash: ", orderHash)

            // 从合约中查询订单信息
            dbOrder = await esDex.orders(orderHash)
            // console.log("dbOrder: ", dbOrder)
            // 验证订单创建者地址是否正确
            expect(dbOrder.order.maker).to.equal(owner.address)

            // 使用callStatic模拟调用取消订单，验证返回成功状态
            successes = await esDex.callStatic.cancelOrders([orderHash])
            expect(successes[0]).to.equal(true)

            // 注释掉的代码：验证是否发出LogCancel事件
            // await expect(await esDex.cancelOrders([orderHash]))
            //     .to.emit(esDex, "LogCancel")

            // 实际执行取消订单交易，验证ETH余额变化（金库退还0.05 ETH给用户）
            await expect(await esDex.cancelOrders([orderHash]))
                .to.changeEtherBalances([owner, esVault], [toBn("0.05"), toBn("-0.05")]);

            // 验证订单已取消：filledAmount应该等于最大值（表示已取消状态）
            stat = await esDex.filledAmount(orderHash)
            expect(stat).to.equal(Uint256Max)
        })

        // 辅助函数：准备部分成交的订单（用于测试部分成交后取消的情况）
        async function perparePartlyFilledOrder() {
            // 创建买单（竞价单）
            let now = parseInt(new Date() / 1000) + 10000000000  // 设置很长的过期时间
            let salt = 1;  // 随机盐值
            let nftAddress = testERC721.address;  // NFT合约地址
            let tokenId = 1;  // NFT代币ID
            // 构建买单订单对象（数量为4个）
            let buyOrder = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: addr1.address,  // 订单创建者地址（使用addr1账户）
                nft: [tokenId, nftAddress, 4],  // NFT信息：[代币ID, 合约地址, 数量4]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 使用addr1账户创建买单，验证是否发出LogMake事件
            await expect(await esDex.connect(addr1).makeOrders([buyOrder], { value: toBn("0.04") }))
                .to.emit(esDex, "LogMake")

            // 使用测试库计算订单哈希
            const orderHash = await testLibOrder.getOrderHash(buyOrder)
            // console.log("buy orderHash: ", orderHash)

            // 从合约中查询订单信息
            const dbOrder = await esDex.orders(orderHash)
            // console.log("buy order: ", dbOrder)

            // 创建市价卖单（与买单匹配）
            now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            salt = 2;  // 新的随机盐值
            nftAddress = testERC721.address;  // NFT合约地址
            tokenId = 1;  // NFT代币ID
            sellOrder = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量1]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 执行订单匹配，验证ETH余额变化和NFT所有权转移
            await expect(await esDex.matchOrder(sellOrder, buyOrder))
                .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
            // 验证NFT已转移到addr1账户
            expect(await testERC721.ownerOf(1)).to.equal(addr1.address)
            // 返回订单哈希，供后续测试使用
            return orderHash
        }

        // 测试用例：成功取消部分成交的买单
        it("should cancel bid order partly filled successfully", async () => {
            // 调用辅助函数准备部分成交的订单
            orderHash = await perparePartlyFilledOrder();
            // console.log("orderHash: ", orderHash)

            // 使用addr1账户取消订单，验证是否发出LogCancel事件
            await expect(await esDex.connect(addr1).cancelOrders([orderHash]))
                .to.emit(esDex, "LogCancel")

            // 验证订单已取消：filledAmount应该等于最大值（表示已取消状态）
            stat = await esDex.filledAmount(orderHash)
            expect(stat).to.equal(Uint256Max)

            // 验证金库中该订单的ETH余额已清零（剩余ETH已退还给用户）
            newETHBalance = await esVault.ETHBalance(orderHash);
            expect(newETHBalance).to.equal(toBn("0"))
        })
    })

    // 测试套件：验证订单编辑功能
    describe("should edit orders successfully", async () => {
        // 测试用例：成功编辑挂单
        it("should edit list orders successfully", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 1;  // NFT代币ID
            // 构建第一个挂单订单对象
            const order = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            tokenId2 = 2;  // 第二个NFT代币ID
            // 构建第二个挂单订单对象
            order2 = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order, order2];  // 将两个订单放入数组

            // 创建两个挂单，验证是否发出LogMake事件
            await expect(await esDex.makeOrders(orders))
                .to.emit(esDex, "LogMake")

            const orderHash = await testLibOrder.getOrderHash(order)
            // console.log("orderHash: ", orderHash)

            const order2Hash = await testLibOrder.getOrderHash(order2)
            // console.log("order2Hash: ", order2Hash)

            dbOrder = await esDex.orders(orderHash)
            expect(dbOrder.order.maker).to.equal(owner.address)

            dbOrder2 = await esDex.orders(order2Hash)
            expect(dbOrder2.order.maker).to.equal(owner.address)

            // 构建编辑后的新订单对象
            newOrder = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 新价格：0.02 ETH（比原来高）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            newOrder2 = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.04"),  // 新价格：0.04 ETH（比原来高）
                expiry: now,  // 过期时间
                salt: 11,  // 新的随机盐值
            }

            // 构建编辑详情对象：包含旧订单哈希和新订单信息
            editDetail1 = {
                oldOrderKey: orderHash,  // 第一个旧订单的哈希
                newOrder: newOrder,  // 第一个新订单对象
            }
            editDetail2 = {
                oldOrderKey: order2Hash,  // 第二个旧订单的哈希
                newOrder: newOrder2,  // 第二个新订单对象
            }

            editDetails = [editDetail1, editDetail2]  // 将编辑详情放入数组

            // 使用callStatic模拟调用编辑订单，验证返回的新订单哈希不为零值
            newOrderKeys = await esDex.callStatic.editOrders(editDetails)
            expect(newOrderKeys[0]).to.not.equal(Byte32Zero)  // 验证第一个新订单哈希有效
            expect(newOrderKeys[1]).to.not.equal(Byte32Zero)  // 验证第二个新订单哈希有效

            // 测试跳过重复订单的情况：第二个订单与第一个重复，应该被跳过
            editDetailsSkip = [editDetail1, editDetail1, editDetail2]  // 包含重复的编辑详情
            newOrderKeys = await esDex.callStatic.editOrders(editDetailsSkip)
            expect(newOrderKeys[0]).to.not.equal(Byte32Zero)  // 第一个订单编辑成功
            expect(newOrderKeys[1]).to.equal(Byte32Zero)  // 第二个重复订单被跳过
            expect(newOrderKeys[2]).to.not.equal(Byte32Zero)  // 第三个订单编辑成功
            // 实际执行编辑订单交易
            await esDex.editOrders(editDetails)

            // 验证新订单的NFT余额：NFT已从旧订单转移到新订单
            const newOrderHash = await testLibOrder.getOrderHash(newOrder)
            newNFTBalance = await esVault.NFTBalance(newOrderHash);  // 查询新订单的NFT余额
            expect(newNFTBalance).to.equal(1)  // 验证新订单有1个NFT

            oldNFTBalance = await esVault.NFTBalance(orderHash);  // 查询旧订单的NFT余额
            expect(oldNFTBalance).to.equal(0)  // 验证旧订单NFT余额为0

            const newOrder2Hash = await testLibOrder.getOrderHash(newOrder2)
            newNFT2Balance = await esVault.NFTBalance(newOrder2Hash);  // 查询第二个新订单的NFT余额
            expect(newNFT2Balance).to.equal(2)  // 验证第二个新订单有2个NFT（tokenId=2）

            oldNFT2Balance = await esVault.NFTBalance(order2Hash);  // 查询第二个旧订单的NFT余额
            expect(oldNFT2Balance).to.equal(0)  // 验证第二个旧订单NFT余额为0

            // 验证订单状态：新订单未成交，旧订单已取消
            newStat = await esDex.filledAmount(newOrderHash);  // 查询新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            oldStat = await esDex.filledAmount(orderHash);  // 查询旧订单的成交数量
            expect(oldStat).to.equal(Uint256Max)  // 验证旧订单已取消（成交数量为最大值）

            newStat2 = await esDex.filledAmount(newOrder2Hash);  // 查询第二个新订单的成交数量
            expect(newStat2).to.equal(0)  // 验证第二个新订单未成交
            oldStat2 = await esDex.filledAmount(order2Hash);  // 查询第二个旧订单的成交数量
            expect(oldStat2).to.equal(Uint256Max)  // 验证第二个旧订单已取消
        })

        // 测试用例：成功编辑买单，所有新价格都高于旧价格
        it("should edit bid order successfully, all new price > old price", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建第一个买单订单对象
            const order1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            tokenId2 = 2;  // 第二个NFT代币ID
            // 构建第二个买单订单对象
            const order2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order1, order2];  // 将两个订单放入数组

            // 创建两个买单，验证ETH余额变化（用户支付0.02 ETH到金库）
            await expect(await esDex.makeOrders(orders, { value: toBn("0.04") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.02"), toBn("0.02")]);

            const orderHash = await testLibOrder.getOrderHash(order1)
            // console.log("orderHash: ", orderHash)
            const order2Hash = await testLibOrder.getOrderHash(order2)
            // console.log("order2Hash: ", order2Hash)

            dbOrder = await esDex.orders(orderHash)
            expect(dbOrder.order.maker).to.equal(owner.address)

            dbOrder2 = await esDex.orders(order2Hash)
            expect(dbOrder2.order.maker).to.equal(owner.address)

            // 构建编辑后的新订单对象（价格都高于原订单）
            newOrder1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 2],  // NFT信息：[代币ID, 合约地址, 数量2]
                price: toBn("0.02"),  // 新价格：0.02 ETH（比原来高）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            newOrder2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 2],  // NFT信息：[代币ID, 合约地址, 数量2]
                price: toBn("0.03"),  // 新价格：0.03 ETH（比原来高）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建编辑详情对象
            editDetail1 = {
                oldOrderKey: orderHash,  // 第一个旧订单的哈希
                newOrder: newOrder1  // 第一个新订单对象
            }
            editDetail2 = {
                oldOrderKey: order2Hash,  // 第二个旧订单的哈希
                newOrder: newOrder2  // 第二个新订单对象
            }
            editDetails = [editDetail1, editDetail2]  // 将编辑详情放入数组

            // 使用callStatic模拟调用编辑订单，验证返回的新订单哈希不为零值
            newOrderKeys = await esDex.callStatic.editOrders(editDetails, { value: toBn("0.09") })
            expect(newOrderKeys[0]).to.not.equal(Byte32Zero)  // 验证第一个新订单哈希有效
            expect(newOrderKeys[1]).to.not.equal(Byte32Zero)  // 验证第二个新订单哈希有效

            // 实际执行编辑订单交易，验证ETH余额变化（用户需要额外支付0.08 ETH）
            await expect(await esDex.editOrders(editDetails, { value: toBn("0.1") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.08"), toBn("0.08")]);

            // 验证订单状态：新订单未成交，旧订单已取消
            const newOrderHash = await testLibOrder.getOrderHash(newOrder1)
            newStat = await esDex.filledAmount(newOrderHash);  // 查询新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            oldStat = await esDex.filledAmount(orderHash);  // 查询旧订单的成交数量
            expect(oldStat).to.equal(Uint256Max)  // 验证旧订单已取消

            const newOrder2Hash = await testLibOrder.getOrderHash(newOrder2)
            new2Stat = await esDex.filledAmount(newOrder2Hash);  // 查询第二个新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            old2Stat = await esDex.filledAmount(order2Hash);  // 查询第二个旧订单的成交数量
            expect(old2Stat).to.equal(Uint256Max)  // 验证第二个旧订单已取消

            // 验证ETH余额：新订单有ETH，旧订单ETH已清零
            newETHBalance = await esVault.ETHBalance(newOrderHash);  // 查询新订单的ETH余额
            expect(newETHBalance).to.equal(toBn("0.04"))  // 验证新订单有0.04 ETH
            oldETHBalance = await esVault.ETHBalance(orderHash);  // 查询旧订单的ETH余额
            expect(oldETHBalance).to.equal(0)  // 验证旧订单ETH余额为0

            newETHBalance2 = await esVault.ETHBalance(newOrder2Hash);  // 查询第二个新订单的ETH余额
            expect(newETHBalance2).to.equal(toBn("0.06"))  // 验证第二个新订单有0.06 ETH

            oldETHBalance2 = await esVault.ETHBalance(order2Hash);  // 查询第二个旧订单的ETH余额
            expect(oldETHBalance2).to.equal(0)  // 验证第二个旧订单ETH余额为0
        })

        // 测试用例：成功编辑买单，所有新价格都低于旧价格
        it("should edit bid order successfully, all new price < old price", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建第一个买单订单对象
            const order1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            tokenId2 = 2  // 第二个NFT代币ID
            // 构建第二个买单订单对象
            const order2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order1, order2];  // 将两个订单放入数组

            // 创建两个买单，验证ETH余额变化（用户支付0.02 ETH到金库）
            await expect(await esDex.makeOrders(orders, { value: toBn("0.04") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.02"), toBn("0.02")]);

            const orderHash = await testLibOrder.getOrderHash(order1)  // 计算第一个订单哈希
            // console.log("orderHash: ", orderHash)
            const order2Hash = await testLibOrder.getOrderHash(order2)  // 计算第二个订单哈希
            // console.log("order2Hash: ", order2Hash)

            // 验证订单信息
            dbOrder = await esDex.orders(orderHash)  // 查询第一个订单信息
            expect(dbOrder.order.maker).to.equal(owner.address)  // 验证订单创建者

            dbOrder2 = await esDex.orders(order2Hash)  // 查询第二个订单信息
            expect(dbOrder2.order.maker).to.equal(owner.address)  // 验证订单创建者

            // 构建编辑后的新订单对象（价格都低于原订单）
            newOrder1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 3],  // NFT信息：[代币ID, 合约地址, 数量3]
                price: toBn("0.005"),  // 新价格：0.005 ETH（比原来低）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            newOrder2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 5],  // NFT信息：[代币ID, 合约地址, 数量5]
                price: toBn("0.006"),  // 新价格：0.006 ETH（比原来低）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建编辑详情对象
            editDetail1 = {
                oldOrderKey: orderHash,  // 第一个旧订单的哈希
                newOrder: newOrder1  // 第一个新订单对象
            }
            editDetail2 = {
                oldOrderKey: order2Hash,  // 第二个旧订单的哈希
                newOrder: newOrder2  // 第二个新订单对象
            }
            editDetails = [editDetail1, editDetail2]  // 将编辑详情放入数组

            // 使用callStatic模拟调用编辑订单，验证返回的新订单哈希不为零值
            newOrderKeys = await esDex.callStatic.editOrders(editDetails, { value: toBn("0.04") })
            expect(newOrderKeys[0]).to.not.equal(Byte32Zero)  // 验证第一个新订单哈希有效
            expect(newOrderKeys[1]).to.not.equal(Byte32Zero)  // 验证第二个新订单哈希有效

            // 实际执行编辑订单交易，验证ETH余额变化（用户需要额外支付0.025 ETH）
            await expect(await esDex.editOrders(editDetails, { value: toBn("0.04") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.025"), toBn("0.025")]);

            // 验证订单状态：新订单未成交，旧订单已取消
            const newOrderHash = await testLibOrder.getOrderHash(newOrder1)  // 计算新订单哈希
            newStat = await esDex.filledAmount(newOrderHash);  // 查询新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            oldStat = await esDex.filledAmount(orderHash);  // 查询旧订单的成交数量
            expect(oldStat).to.equal(Uint256Max)  // 验证旧订单已取消

            const newOrder2Hash = await testLibOrder.getOrderHash(newOrder2)  // 计算第二个新订单哈希
            new2Stat = await esDex.filledAmount(newOrder2Hash);  // 查询第二个新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            old2Stat = await esDex.filledAmount(order2Hash);  // 查询第二个旧订单的成交数量
            expect(old2Stat).to.equal(Uint256Max)  // 验证第二个旧订单已取消

            // 验证ETH余额：新订单有ETH，旧订单ETH已清零
            newETHBalance = await esVault.ETHBalance(newOrderHash);  // 查询新订单的ETH余额
            expect(newETHBalance).to.equal(toBn("0.015"))  // 验证新订单有0.015 ETH
            oldETHBalance = await esVault.ETHBalance(orderHash);  // 查询旧订单的ETH余额
            expect(oldETHBalance).to.equal(0)  // 验证旧订单ETH余额为0

            newETHBalance2 = await esVault.ETHBalance(newOrder2Hash);  // 查询第二个新订单的ETH余额
            expect(newETHBalance2).to.equal(toBn("0.03"))  // 验证第二个新订单有0.03 ETH

            oldETHBalance2 = await esVault.ETHBalance(order2Hash);  // 查询第二个旧订单的ETH余额
            expect(oldETHBalance2).to.equal(0)  // 验证第二个旧订单ETH余额为0
        })

        // 测试用例：成功编辑买单，第一个订单新价格低于旧价格，第二个订单新价格高于旧价格
        it("should edit bid order successfully, order one: new price < old price, order two: new price > old price", async () => {
            const now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            const salt = 1;  // 随机盐值
            const nftAddress = testERC721.address;  // NFT合约地址
            const tokenId = 0;  // NFT代币ID
            // 构建第一个买单订单对象
            const order1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            tokenId2 = 2  // 第二个NFT代币ID
            // 构建第二个买单订单对象
            const order2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }
            const orders = [order1, order2];  // 将两个订单放入数组

            // 创建两个买单，验证ETH余额变化（用户支付0.02 ETH到金库）
            await expect(await esDex.makeOrders(orders, { value: toBn("0.04") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.02"), toBn("0.02")]);

            const orderHash = await testLibOrder.getOrderHash(order1)  // 计算第一个订单哈希
            // console.log("orderHash: ", orderHash)
            const order2Hash = await testLibOrder.getOrderHash(order2)  // 计算第二个订单哈希
            // console.log("order2Hash: ", order2Hash)

            // 验证订单信息
            dbOrder = await esDex.orders(orderHash)  // 查询第一个订单信息
            expect(dbOrder.order.maker).to.equal(owner.address)  // 验证订单创建者

            dbOrder2 = await esDex.orders(order2Hash)  // 查询第二个订单信息
            expect(dbOrder2.order.maker).to.equal(owner.address)  // 验证订单创建者

            // 构建编辑后的新订单对象
            newOrder1 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 2],  // NFT信息：[代币ID, 合约地址, 数量2]
                price: toBn("0.02"),  // 新价格：0.02 ETH（比原来高）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            newOrder2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId2, nftAddress, 3],  // NFT信息：[代币ID, 合约地址, 数量3]
                price: toBn("0.002"),  // 新价格：0.002 ETH（比原来低）
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建编辑详情对象
            editDetail1 = {
                oldOrderKey: orderHash,  // 第一个旧订单的哈希
                newOrder: newOrder1  // 第一个新订单对象
            }
            editDetail2 = {
                oldOrderKey: order2Hash,  // 第二个旧订单的哈希
                newOrder: newOrder2  // 第二个新订单对象
            }
            editDetails = [editDetail1, editDetail2]  // 将编辑详情放入数组

            // 使用callStatic模拟调用编辑订单，验证返回的新订单哈希不为零值
            newOrderKeys = await esDex.callStatic.editOrders(editDetails, { value: toBn("0.04") })
            expect(newOrderKeys[0]).to.not.equal(Byte32Zero)  // 验证第一个新订单哈希有效
            expect(newOrderKeys[1]).to.not.equal(Byte32Zero)  // 验证第二个新订单哈希有效

            // 实际执行编辑订单交易，验证ETH余额变化（用户需要额外支付0.026 ETH）
            await expect(await esDex.editOrders(editDetails, { value: toBn("0.04") }))
                .to.changeEtherBalances([owner, esVault], [toBn("-0.026"), toBn("0.026")]);

            // 验证订单状态：新订单未成交，旧订单已取消
            const newOrderHash = await testLibOrder.getOrderHash(newOrder1)  // 计算新订单哈希
            newStat = await esDex.filledAmount(newOrderHash);  // 查询新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            oldStat = await esDex.filledAmount(orderHash);  // 查询旧订单的成交数量
            expect(oldStat).to.equal(Uint256Max)  // 验证旧订单已取消

            const newOrder2Hash = await testLibOrder.getOrderHash(newOrder2)  // 计算第二个新订单哈希
            new2Stat = await esDex.filledAmount(newOrder2Hash);  // 查询第二个新订单的成交数量
            expect(newStat).to.equal(0)  // 验证新订单未成交
            old2Stat = await esDex.filledAmount(order2Hash);  // 查询第二个旧订单的成交数量
            expect(old2Stat).to.equal(Uint256Max)  // 验证第二个旧订单已取消

            // 验证ETH余额：新订单有ETH，旧订单ETH已清零
            newETHBalance = await esVault.ETHBalance(newOrderHash);  // 查询新订单的ETH余额
            expect(newETHBalance).to.equal(toBn("0.04"))  // 验证新订单有0.04 ETH
            oldETHBalance = await esVault.ETHBalance(orderHash);  // 查询旧订单的ETH余额
            expect(oldETHBalance).to.equal(0)  // 验证旧订单ETH余额为0

            newETHBalance2 = await esVault.ETHBalance(newOrder2Hash);  // 查询第二个新订单的ETH余额
            expect(newETHBalance2).to.equal(toBn("0.006"))  // 验证第二个新订单有0.006 ETH

            oldETHBalance2 = await esVault.ETHBalance(order2Hash);  // 查询第二个旧订单的ETH余额
            expect(oldETHBalance2).to.equal(0)  // 验证第二个旧订单ETH余额为0
        })
    })
    // 测试用例：成功匹配订单
    describe("should match order successfully", async () => {
        // 测试用例：成功匹配订单，验证匹配是否可用
        describe("should check match available successfully", async () => {
            // 测试用例：成功匹配挂单
            it("should match list order successfully", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建市价买单
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.03") }))
                    .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                // tx = await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })
                // txRec = await tx.wait()
                // console.log("txRec: ", txRec.logs)
                // console.log("gasUsed: ", txRec.gasUsed.toString())
            });
            // 测试用例：成功匹配集合买单批量匹配
            it("should match collection bid order successfully", async () => {
                // 创建集合买单（竞价整个集合）
                let now = parseInt(new Date() / 1000) + 10000000000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 1;  // NFT代币ID
                let buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 4],  // NFT信息：[代币ID, 合约地址, 数量4]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建集合买单，验证LogMake事件
                await expect(await esDex.connect(addr1).makeOrders([buyOrder], { value: toBn("0.04") }))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(buyOrder)  // 计算买单哈希
                // console.log("buy orderHash: ", orderHash)

                const dbOrder = await esDex.orders(orderHash)  // 查询买单信息
                // console.log("buy order: ", dbOrder)


                { // 市价卖单1
                    now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                    salt = 2;  // 随机盐值
                    nftAddress = testERC721.address;  // NFT合约地址
                    tokenId = 1;  // NFT代币ID
                    sellOrder = {
                        side: Side.List,  // 订单方向：挂单（卖单）
                        saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                        maker: owner.address,  // 订单创建者地址
                        nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                        price: toBn("0.01"),  // 价格：0.01 ETH
                        expiry: now,  // 过期时间
                        salt: salt,  // 随机盐值
                    }

                    // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                    await expect(await esDex.matchOrder(sellOrder, buyOrder))
                        .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                    expect(await testERC721.ownerOf(1)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                    newStat = await esDex.filledAmount(orderHash);  // 查询买单的成交数量
                    expect(newStat).to.equal(1)  // 验证买单已成交1个

                    newETHBalance = await esVault.ETHBalance(orderHash);  // 查询买单的ETH余额
                    expect(newETHBalance).to.equal(toBn("0.03"))  // 验证买单剩余0.03 ETH
                }

                {// 市价卖单2
                    now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                    salt = 2;  // 随机盐值
                    nftAddress = testERC721.address;  // NFT合约地址
                    tokenId = 2;  // NFT代币ID
                    sellOrder = {
                        side: Side.List,  // 订单方向：挂单（卖单）
                        saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                        maker: owner.address,  // 订单创建者地址
                        nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                        price: toBn("0.01"),  // 价格：0.01 ETH
                        expiry: now,  // 过期时间
                        salt: salt,  // 随机盐值
                    }

                    // 执行订单匹配，验证ETH余额变化
                    await expect(await esDex.matchOrder(sellOrder, buyOrder))
                        .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                    expect(await testERC721.ownerOf(2)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                    newStat = await esDex.filledAmount(orderHash);  // 查询买单的成交数量
                    expect(newStat).to.equal(2)  // 验证买单已成交2个

                    newETHBalance = await esVault.ETHBalance(orderHash);  // 查询买单的ETH余额
                    expect(newETHBalance).to.equal(toBn("0.02"))  // 验证买单剩余0.02 ETH
                }

                {// 市价卖单3
                    now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                    salt = 2;  // 随机盐值
                    nftAddress = testERC721.address;  // NFT合约地址
                    tokenId = 3;  // NFT代币ID
                    sellOrder = {
                        side: Side.List,  // 订单方向：挂单（卖单）
                        saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                        maker: owner.address,  // 订单创建者地址
                        nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                        price: toBn("0.01"),  // 价格：0.01 ETH
                        expiry: now,  // 过期时间
                        salt: salt,  // 随机盐值
                    }

                    // 执行订单匹配，验证ETH余额变化
                    await expect(await esDex.matchOrder(sellOrder, buyOrder))
                        .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                    expect(await testERC721.ownerOf(3)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                    newStat = await esDex.filledAmount(orderHash);  // 查询买单的成交数量
                    expect(newStat).to.equal(3)  // 验证买单已成交3个

                    newETHBalance = await esVault.ETHBalance(orderHash);  // 查询买单的ETH余额
                    expect(newETHBalance).to.equal(toBn("0.01"))  // 验证买单剩余0.01 ETH
                }

                { // 市价卖单4
                    now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                    salt = 2;  // 随机盐值
                    nftAddress = testERC721.address;  // NFT合约地址
                    tokenId = 4;  // NFT代币ID
                    sellOrder = {
                        side: Side.List,  // 订单方向：挂单（卖单）
                        saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                        maker: owner.address,  // 订单创建者地址
                        nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                        price: toBn("0.01"),  // 价格：0.01 ETH
                        expiry: now,  // 过期时间
                        salt: salt,  // 随机盐值
                    }

                    // 执行订单匹配，验证ETH余额变化
                    await expect(await esDex.matchOrder(sellOrder, buyOrder))
                        .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                    expect(await testERC721.ownerOf(4)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                    newStat = await esDex.filledAmount(orderHash);  // 查询买单的成交数量
                    expect(newStat).to.equal(4)  // 验证买单已成交4个

                    newETHBalance = await esVault.ETHBalance(orderHash);  // 查询买单的ETH余额
                    expect(newETHBalance).to.equal(toBn("0"))  // 验证买单ETH余额为0（已全部成交）
                }

                {// 市价卖单5（测试订单已关闭的情况）
                    now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                    salt = 2;  // 随机盐值
                    nftAddress = testERC721.address;  // NFT合约地址
                    tokenId = 5;  // NFT代币ID
                    sellOrder = {
                        side: Side.List,  // 订单方向：挂单（卖单）
                        saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                        maker: owner.address,  // 订单创建者地址
                        nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                        price: toBn("0.01"),  // 价格：0.01 ETH
                        expiry: now,  // 过期时间
                        salt: salt,  // 随机盐值
                    }

                    // 验证订单匹配失败（订单已关闭）
                    await expect(esDex.matchOrder(sellOrder, buyOrder))
                        .to.be.revertedWith("HD: order closed")
                }
            });

            it("should match item bid order successfully", async () => {
                // 创建单个商品买单
                let now = parseInt(new Date() / 1000) + 10000000000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建买单，验证LogMake事件
                await expect(await esDex.connect(addr1).makeOrders([buyOrder], { value: toBn("0.01") }))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(buyOrder)  // 计算买单哈希
                // console.log("buy orderHash: ", orderHash)

                const dbOrder = await esDex.orders(orderHash)  // 查询买单信息
                // console.log("buy order: ", dbOrder)

                // 创建市价卖单
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                sellOrder = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.matchOrder(sellOrder, buyOrder))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                // tx = await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })
                // txRec = await tx.wait()
                // console.log("txRec: ", txRec.events)
                // console.log("gasUsed: ", txRec.gasUsed.toString())
            });

            it("should revert if order is the same", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建相同的订单（测试相同订单匹配失败）
                salt = 1;  // 使用相同的盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.List,  // 订单方向：挂单（卖单）- 相同方向
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证相同订单匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: same order")
            });

            it("should revert if side mismatch", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建相同方向的订单（测试方向不匹配失败）
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.List,  // 订单方向：挂单（卖单）- 相同方向，应该失败
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证方向不匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: side mismatch")
            });

            it("should revert if sale kind mismatch", async () => {
                // 创建挂单（卖单）- 集合类型
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格整个集合
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建买单 - 集合类型（测试销售类型不匹配失败）
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证销售类型不匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: kind mismatch")
            });

            it("should revert if list order's sale kind is for collection", async () => {
                // 创建挂单（卖单）- 集合类型
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建买单 - 单个商品类型（测试销售类型不匹配失败）
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证销售类型不匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: kind mismatch")
                // await expect(await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") }))
                //     .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                // expect(await testERC721.ownerOf(0)).to.equal(addr1.address)

            });

            it("should revert if asset mismatch", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建买单 - 不同的NFT代币ID（测试资产不匹配失败）
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 1;  // NFT代币ID（与挂单不同）
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证资产不匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: asset mismatch")
            });

            it("should revert if order was canceled", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 取消订单，验证LogCancel事件
                await expect(await esDex.cancelOrders([orderHash]))
                    .to.emit(esDex, "LogCancel")

                // 创建买单（测试已取消订单匹配失败）
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证已取消订单匹配失败
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") })).to.be.revertedWith("HD: order closed")
            });

            it("should revert if list order was filled", async () => {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建买单
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 第一次匹配成功，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.03") }))
                    .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                // 第二次匹配失败（订单已成交）
                await expect(esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.03") })).to.be.revertedWith("HD: order closed")
            });

            it("should revert if bid order was filled", async () => {
                // 创建集合买单
                let now = parseInt(new Date() / 1000) + 10000000000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 2],  // NFT信息：[代币ID, 合约地址, 数量2]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建买单，验证LogMake事件
                await expect(await esDex.connect(addr1).makeOrders([buyOrder], { value: toBn("0.02") }))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(buyOrder)  // 计算买单哈希
                // console.log("buy orderHash: ", orderHash)

                const dbOrder = await esDex.orders(orderHash)  // 查询买单信息
                // console.log("buy order: ", dbOrder)

                // 创建市价卖单
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                sellOrder = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 第一次匹配成功，验证ETH余额变化
                await expect(await esDex.matchOrder(sellOrder, buyOrder))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家

                // 创建第二个市价卖单
                tokenId = 1;  // 第二个NFT代币ID
                sellOrder2 = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }
                // 第二次匹配成功，验证ETH余额变化
                await expect(await esDex.matchOrder(sellOrder2, buyOrder))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(tokenId)).to.equal(addr1.address)  // 验证第二个NFT所有权已转移到买家

                // 第三次匹配失败（买单已全部成交）
                await expect(esDex.matchOrder(sellOrder2, buyOrder)).to.be.revertedWith("HD: order closed")
            });
        })
        // 测试用例：成功匹配订单，验证匹配发送者是否为挂单maker
        describe("should check match successfully if msg.sender is sellOrder.maker", async () => {
            let bidOrder;  // 定义买单变量

            beforeEach(async function () {
                // 创建买单报价
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 2;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 1;  // NFT代币ID
                bidOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                orders = [bidOrder]  // 将买单放入数组
                // 创建买单，验证ETH余额变化
                await expect(await esDex.connect(addr1).makeOrders(orders, { value: toBn("0.02") }))
                    .to.changeEtherBalances([addr1, esVault], [toBn("-0.01"), toBn("0.01")]);

                const orderHash = await testLibOrder.getOrderHash(bidOrder)  // 计算买单哈希
                // console.log("orderHash: ", orderHash)

            })

            it("should match order successfully", async () => {
                // 接受买单报价
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                expect(await testERC721.ownerOf(0)).to.equal(owner.address)  // 验证NFT所有权属于卖家
                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家
            })

            it("should match order with exist list order successfully", async () => {
                // 接受买单报价（与已存在的挂单匹配）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                orders = [order]  // 将挂单放入数组
                await esDex.makeOrders(orders);  // 创建挂单

                expect(await testERC721.ownerOf(0)).to.equal(esVault.address)  // 验证NFT所有权已转移到金库
                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家
            })

            it("should revert if msgValue > 0", async () => {
                // 接受买单报价（测试msgValue > 0失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证msgValue > 0失败
                await expect(esDex.connect(owner).matchOrder(order, bidOrder, { value: toBn("0.01") }))
                    .to.be.revertedWith("HD: value > 0")
            })

            it("should revert if maker is zero", async () => {
                // 接受买单报价（测试maker为零地址失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: AddressZero,  // 订单创建者地址为零地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证maker为零地址失败
                await expect(esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.be.revertedWith("HD: sender invalid")
            })

            it("should revert if salt = 0", async () => {
                // 接受买单报价（测试盐值为零失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 0;  // 盐值为零
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证盐值为零失败
                await expect(esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.be.revertedWith("OVa: zero salt")
            })

            it("should revert if unsupported nft asset", async () => {
                // 接受买单报价（测试不支持的NFT资产失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, AddressZero, 1],  // NFT信息：[代币ID, 零地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证不支持的NFT资产失败
                await expect(esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.be.revertedWith("OVa: unsupported nft asset")
            })

            it.skip("should revert if buy price < sell price", async () => {
                // 接受买单报价（测试买单价格低于卖单价格失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证买单价格低于卖单价格失败
                await expect(esDex.connect(owner).matchOrder(order, bidOrder))
                    .to.be.revertedWith("HD: buy price < fill price")
            })
        })
        // 测试用例：成功匹配订单，验证匹配发送者是否为买单maker
        describe("should check match successfully if msg.sender is buyOrder.maker", async () => {
            let listOrder;  // 定义挂单变量

            beforeEach(async function () {
                // 创建挂单报价
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 2;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                listOrder = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                orders = [listOrder]  // 将挂单放入数组
                await esDex.connect(owner).makeOrders(orders)  // 创建挂单

                const orderHash = await testLibOrder.getOrderHash(listOrder)  // 计算挂单哈希
                // console.log("orderHash: ", orderHash)
            })

            it("should match order successfully", async () => {
                // 接受挂单 == 买单
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                expect(await testERC721.ownerOf(0)).to.equal(esVault.address)  // 验证NFT所有权在金库
                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(addr1).matchOrder(listOrder, order, { value: toBn("0.01") }))
                    .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家
            })

            it("should match order with exist bid order successfully", async () => {
                // 接受挂单 == 买单（与已存在的买单匹配）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }
                orders = [order]  // 将买单放入数组

                // 创建买单，验证ETH余额变化
                await expect(await esDex.connect(addr1).makeOrders(orders, { value: toBn("0.04") }))
                    .to.changeEtherBalances([addr1, esVault], [toBn("-0.01"), toBn("0.01")]);

                expect(await testERC721.ownerOf(0)).to.equal(esVault.address)  // 验证NFT所有权在金库
                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家
            })

            it("should revert if maker is zero", async () => {
                // 接受挂单 == 买单（测试maker为零地址失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: AddressZero,  // 订单创建者地址为零地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证maker为零地址失败
                await expect(esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.be.revertedWith("HD: sender invalid")
            })

            it("should revert if salt = 0", async () => {
                // 接受挂单 == 买单（测试盐值为零失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 0;  // 盐值为零
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证盐值为零失败
                await expect(esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.be.revertedWith("OVa: zero salt")
            })

            it("should revert if unsupported nft asset", async () => {
                // 接受挂单 == 买单（测试不支持的NFT资产失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 1;  // NFT代币ID（与挂单不同）
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.01"),  // 价格：0.01 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证不支持的NFT资产失败
                await expect(esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.be.revertedWith("HD: asset mismatch")
            })

            it("should revert if value < sell price", async () => {
                // 接受挂单 == 买单（测试value小于卖价失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.02"),  // 价格：0.02 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 验证value小于卖价失败
                await expect(esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.be.revertedWith("HD: value < fill price")
            })

            it("should revert if buy price < sell price", async () => {
                // 接受挂单 == 买单（测试买单价格低于卖单价格失败）
                now = parseInt(new Date() / 1000) + 100000;  // 设置过期时间
                salt = 1;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("0.002"),  // 价格：0.002 ETH（低于卖价0.01）
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                orders = [order]  // 将买单放入数组

                // 创建买单，验证ETH余额变化
                await expect(await esDex.connect(addr1).makeOrders(orders, { value: toBn("0.004") }))
                    .to.changeEtherBalances([addr1, esVault], [toBn("-0.002"), toBn("0.002")]);

                // 验证买单价格低于卖单价格失败
                await expect(esDex.connect(addr1).matchOrder(listOrder, order))
                    .to.be.revertedWith("HD: buy price < fill price")
            })
        })
    })

    describe("should match orders successfully", async () => {
        it("should match list orders successfully", async () => {
            // 创建第一个挂单
            let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            let salt = 1;  // 随机盐值
            let nftAddress = testERC721.address;  // NFT合约地址
            let tokenId = 0;  // NFT代币ID
            let order = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 创建第一个挂单，验证LogMake事件
            await expect(await esDex.makeOrders([order]))
                .to.emit(esDex, "LogMake")

            const orderHash = await testLibOrder.getOrderHash(order)  // 计算第一个订单哈希
            // console.log("orderHash: ", orderHash)

            // 创建第二个挂单
            now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            salt = 1;  // 随机盐值
            nftAddress = testERC721.address;  // NFT合约地址
            tokenId = 1;  // NFT代币ID
            order2 = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.01"),  // 价格：0.01 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 创建第二个挂单，验证LogMake事件
            await expect(await esDex.makeOrders([order2]))
                .to.emit(esDex, "LogMake")

            // 创建第一个市价买单
            now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            salt = 2;  // 随机盐值
            nftAddress = testERC721.address;  // NFT合约地址
            tokenId = 0;  // NFT代币ID
            buyOrder = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: addr1.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 创建第二个市价买单
            tokenId = 1;  // NFT代币ID
            buyOrder2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: addr1.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建匹配详情对象
            matchDetail1 = {
                sellOrder: order,  // 第一个卖单
                buyOrder: buyOrder,  // 第一个买单
            }
            matchDetail2 = {
                sellOrder: order2,  // 第二个卖单
                buyOrder: buyOrder2,  // 第二个买单
            }
            matchDetails = [matchDetail1, matchDetail2]  // 将匹配详情放入数组

            // 使用callStatic模拟调用批量匹配订单，验证返回的成功状态
            successes = await esDex.connect(addr1).callStatic.matchOrders(matchDetails, { value: toBn("0.06") })
            expect(successes[0]).to.equal(true)  // 验证第一个匹配成功
            expect(successes[1]).to.equal(true)  // 验证第二个匹配成功

            // 实际执行批量匹配订单，验证ETH余额变化
            await expect(await esDex.connect(addr1).matchOrders(matchDetails, { value: toBn("0.06") }))
                .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0004"), toBn("0.0196"), toBn("-0.02")]);

            // 验证NFT所有权已转移到买家
            expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证第一个NFT所有权
            expect(await testERC721.ownerOf(1)).to.equal(addr1.address)  // 验证第二个NFT所有权
        });

        // 测试用例：成功匹配集合买单
        it("should match bid orders successfully", async () => {
            // 创建第一个集合买单
            let now = parseInt(new Date() / 1000) + 10000000000  // 设置过期时间
            let salt = 1;  // 随机盐值
            let nftAddress = testERC721.address;  // NFT合约地址
            let tokenId = 0;  // NFT代币ID
            let buyOrder = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                maker: addr1.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            const orderHash = await testLibOrder.getOrderHash(buyOrder)  // 计算第一个买单哈希
            // console.log("orderHash: ", orderHash)

            // 创建第二个集合买单
            now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            salt = 1;  // 随机盐值
            nftAddress = testERC721.address;  // NFT合约地址
            tokenId = 0;  // NFT代币ID
            let buyOrder2 = {
                side: Side.Bid,  // 订单方向：买单（竞价）
                saleKind: SaleKind.FixedPriceForCollection,  // 销售类型：固定价格整个集合
                maker: addr1.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 创建两个买单，验证LogMake事件
            await expect(await esDex.connect(addr1).makeOrders([buyOrder, buyOrder2], { value: toBn("0.04") }))
                .to.emit(esDex, "LogMake")

            // 创建第一个市价卖单
            now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
            salt = 2;  // 随机盐值
            nftAddress = testERC721.address;  // NFT合约地址
            tokenId = 1;  // NFT代币ID
            sellOrder = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 创建第二个市价卖单
            tokenId = 2;  // NFT代币ID
            sellOrder2 = {
                side: Side.List,  // 订单方向：挂单（卖单）
                saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                maker: owner.address,  // 订单创建者地址
                nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                price: toBn("0.02"),  // 价格：0.02 ETH
                expiry: now,  // 过期时间
                salt: salt,  // 随机盐值
            }

            // 构建匹配详情对象
            matchDetail1 = {
                sellOrder: sellOrder,  // 第一个卖单
                buyOrder: buyOrder,  // 第一个买单
            }
            matchDetail2 = {
                sellOrder: sellOrder2,  // 第二个卖单
                buyOrder: buyOrder2,  // 第二个买单
            }
            matchDetails = [matchDetail1, matchDetail2]  // 将匹配详情放入数组
            // await expect(await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("0.01") }))
            //     .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.0002"), toBn("0.0098"), toBn("-0.01")]);
            // expect(await testERC721.ownerOf(0)).to.equal(addr1.address)

            // tx = await esDex.connect(addr1).matchOrders(matchDetails, { value: toBn("0.01") })
            // txRec = await tx.wait()
            // console.log("txRec: ", txRec.events)
            // console.log("gasUsed: ", txRec.gasUsed.toString())

            // 使用callStatic模拟调用批量匹配订单，验证返回的成功状态
            successes = await esDex.callStatic.matchOrders(matchDetails)
            // console.log("successes: ", successes)
            expect(successes[0]).to.equal(true)  // 验证第一个匹配成功
            expect(successes[1]).to.equal(true)  // 验证第二个匹配成功

            // 实际执行批量匹配订单，验证ETH余额变化
            await expect(await esDex.matchOrders(matchDetails))
                .to.changeEtherBalances([esDex, owner, esVault], [toBn("0.0008"), toBn("0.0392"), toBn("-0.04")]);

            // 验证NFT所有权已转移到买家
            expect(await testERC721.ownerOf(1)).to.equal(addr1.address)  // 验证第一个NFT所有权
            expect(await testERC721.ownerOf(2)).to.equal(addr1.address)  // 验证第二个NFT所有权
        });
    })

    //转移NFT测试
    describe("should transfer nft successfully", async () => {
        it("should transfer erc721 successfully", async () => {
            // 验证NFT所有权初始状态
            expect(await testERC721.ownerOf(0)).to.equal(owner.address)  // 验证NFT 0属于owner
            expect(await testERC721.ownerOf(1)).to.equal(owner.address)  // 验证NFT 1属于owner

            to = addr1.address  // 设置接收地址
            asset1 = [testERC721.address, 0]  // 第一个资产：[合约地址, 代币ID]
            asset2 = [testERC721.address, 1]  // 第二个资产：[合约地址, 代币ID]
            assets = [asset1, asset2]  // 将资产放入数组

            // 执行批量转移ERC721操作
            await esVault.batchTransferERC721(to, assets)  // 批量转移NFT到指定地址
            expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT 0已转移到addr1
            expect(await testERC721.ownerOf(1)).to.equal(addr1.address)  // 验证NFT 1已转移到addr1
        });

    })
    //提取ETH测试
    describe("withdraw ETH", async () => {
        it("should withdraw ETH successfully", async () => {
            {
                // 创建挂单（卖单）
                let now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                let salt = 1;  // 随机盐值
                let nftAddress = testERC721.address;  // NFT合约地址
                let tokenId = 0;  // NFT代币ID
                let order = {
                    side: Side.List,  // 订单方向：挂单（卖单）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: owner.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("1"),  // 价格：1 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 创建挂单，验证LogMake事件
                await expect(await esDex.makeOrders([order]))
                    .to.emit(esDex, "LogMake")

                const orderHash = await testLibOrder.getOrderHash(order)  // 计算订单哈希
                // console.log("orderHash: ", orderHash)

                // 创建市价买单
                now = parseInt(new Date() / 1000) + 100000  // 设置过期时间
                salt = 2;  // 随机盐值
                nftAddress = testERC721.address;  // NFT合约地址
                tokenId = 0;  // NFT代币ID
                buyOrder = {
                    side: Side.Bid,  // 订单方向：买单（竞价）
                    saleKind: SaleKind.FixedPriceForItem,  // 销售类型：固定价格单个商品
                    maker: addr1.address,  // 订单创建者地址
                    nft: [tokenId, nftAddress, 1],  // NFT信息：[代币ID, 合约地址, 数量]
                    price: toBn("2"),  // 价格：2 ETH
                    expiry: now,  // 过期时间
                    salt: salt,  // 随机盐值
                }

                // 执行订单匹配，验证ETH余额变化和NFT所有权转移
                await expect(await esDex.connect(addr1).matchOrder(order, buyOrder, { value: toBn("3") }))
                    .to.changeEtherBalances([esDex, owner, addr1], [toBn("0.02"), toBn("0.98"), toBn("-1")]);
                expect(await testERC721.ownerOf(0)).to.equal(addr1.address)  // 验证NFT所有权已转移到买家
            }

            // 提取ETH，验证余额变化
            await expect(await esDex.withdrawETH(owner.address, toBn("0.02")))
                .to.changeEtherBalances([esDex, owner], [toBn("-0.02"), toBn("0.02")])
        })
    })
})
