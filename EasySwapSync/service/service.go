package service

// 定义当前包名为service，提供主要的服务功能

import (
	"context"
	"fmt"
	"sync"

	// 导入标准库包：
	// context: 上下文管理，用于控制goroutine生命周期和取消
	// fmt: 格式化输入输出
	// sync: 提供同步原语，如WaitGroup

	"github.com/ProjectsTask/EasySwapBase/chain"
	"github.com/ProjectsTask/EasySwapBase/chain/chainclient"
	"github.com/ProjectsTask/EasySwapBase/ordermanager"
	"github.com/ProjectsTask/EasySwapBase/stores/xkv"
	"github.com/pkg/errors"
	"github.com/zeromicro/go-zero/core/stores/cache"
	"github.com/zeromicro/go-zero/core/stores/kv"
	"github.com/zeromicro/go-zero/core/stores/redis"
	"gorm.io/gorm"

	// 导入第三方依赖包：
	// chain: 区块链相关基础功能
	// chainclient: 区块链客户端
	// ordermanager: 订单管理功能
	// xkv: 键值存储封装
	// errors: 增强的错误处理包
	// cache/kv/redis: go-zero框架的缓存和KV存储组件
	// gorm: ORM数据库框架

	"github.com/ProjectsTask/EasySwapSync/service/orderbookindexer"
	// 导入内部包：订单簿索引器服务

	"github.com/ProjectsTask/EasySwapSync/model"
	"github.com/ProjectsTask/EasySwapSync/service/collectionfilter"
	"github.com/ProjectsTask/EasySwapSync/service/config"
	// 导入内部包：
	// model: 数据模型和数据库操作
	// collectionfilter: 集合过滤器服务
	// config: 配置管理
)

// Service 结构体定义了主服务的所有组件
type Service struct {
	ctx              context.Context            // 上下文，用于控制服务生命周期
	config           *config.Config             // 应用配置信息
	kvStore          *xkv.Store                 // 键值存储实例，用于缓存和临时数据
	db               *gorm.DB                   // 数据库连接实例
	wg               *sync.WaitGroup            // 等待组，用于协调goroutine的同步
	collectionFilter *collectionfilter.Filter   // 集合过滤器，用于过滤和管理NFT集合
	orderbookIndexer *orderbookindexer.Service  // 订单簿索引器，负责索引区块链订单数据
	orderManager     *ordermanager.OrderManager // 订单管理器，处理订单业务逻辑
}

// New 函数创建并初始化Service实例
func New(ctx context.Context, cfg *config.Config) (*Service, error) {
	// 初始化KV存储配置
	var kvConf kv.KvConf
	// 遍历配置中的Redis节点信息
	for _, con := range cfg.Kv.Redis {
		// 将每个Redis节点配置转换为go-zero需要的格式
		kvConf = append(kvConf, cache.NodeConf{
			RedisConf: redis.RedisConf{
				Host: con.Host, // Redis服务器地址
				Type: con.Type, // 节点类型（如cluster、node等）
				Pass: con.Pass, // Redis密码
			},
			Weight: 2, // 节点权重，用于负载均衡
		})
	}

	// 创建KV存储实例
	kvStore := xkv.NewStore(kvConf)

	var err error
	// 初始化数据库连接
	db := model.NewDB(cfg.DB)
	// 创建集合过滤器实例，用于过滤和管理NFT集合
	collectionFilter := collectionfilter.New(ctx, db, cfg.ChainCfg.Name, cfg.ProjectCfg.Name)
	// 创建订单管理器实例，处理订单相关业务逻辑
	orderManager := ordermanager.New(ctx, db, kvStore, cfg.ChainCfg.Name, cfg.ProjectCfg.Name)

	// 声明订单簿同步器和区块链客户端变量
	var orderbookSyncer *orderbookindexer.Service
	var chainClient chainclient.ChainClient

	// 打印区块链客户端连接信息（用于调试）
	fmt.Println("chainClient url:" + cfg.AnkrCfg.HttpsUrl + cfg.AnkrCfg.ApiKey)

	// 创建区块链客户端实例
	chainClient, err = chainclient.New(int(cfg.ChainCfg.ID), cfg.AnkrCfg.HttpsUrl+cfg.AnkrCfg.ApiKey)
	if err != nil {
		// 如果创建失败，返回包装后的错误信息
		return nil, errors.Wrap(err, "failed on create evm client")
	}

	// 根据链ID选择相应的订单簿索引器
	switch cfg.ChainCfg.ID {
	case chain.EthChainID, chain.OptimismChainID, chain.SepoliaChainID:
		// 为以太坊、Optimism、Sepolia网络创建订单簿索引器
		orderbookSyncer = orderbookindexer.New(ctx, cfg, db, kvStore, chainClient, cfg.ChainCfg.ID, cfg.ChainCfg.Name, orderManager)
	}

	if err != nil {
		// 错误处理，返回包装后的错误信息
		return nil, errors.Wrap(err, "failed on create trade info server")
	}

	// 创建并初始化Service管理器实例
	manager := Service{
		ctx:              ctx,               // 传入的上下文
		config:           cfg,               // 配置信息
		db:               db,                // 数据库连接
		kvStore:          kvStore,           // 键值存储
		collectionFilter: collectionFilter,  // 集合过滤器
		orderbookIndexer: orderbookSyncer,   // 订单簿索引器
		orderManager:     orderManager,      // 订单管理器
		wg:               &sync.WaitGroup{}, // 新的等待组实例
	}

	// 返回Service实例的指针
	return &manager, nil
}

// Start 方法启动所有服务组件
func (s *Service) Start() error {
	// 注释强调不要移动预加载集合的位置（可能是初始化顺序敏感）
	// 预加载集合到过滤器中
	if err := s.collectionFilter.PreloadCollections(); err != nil {
		// 如果预加载失败，返回错误信息
		return errors.Wrap(err, "failed on preload collection to filter")
	}

	// 启动订单簿索引器服务
	s.orderbookIndexer.Start()
	// 启动订单管理器服务
	s.orderManager.Start()

	// 返回nil表示启动成功
	return nil
}
