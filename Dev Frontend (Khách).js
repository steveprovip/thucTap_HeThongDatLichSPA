/**
 * Tải danh mục và tìm kiếm dịch vụ.
 * Chờ 250 ms khi nhập để hạn chế gọi API liên tục.
 * Bỏ qua phản hồi cũ khi khách đổi từ khóa hoặc rời trang.
 */
useEffect(() => {
  let active = true;
  const keyword = search.trim();

  setLoading(true);

  const timer = window.setTimeout(async () => {
    try {
      const catalog = await publicApi.catalog(keyword || undefined);

      // Chỉ cập nhật kết quả của lần tìm kiếm hiện tại.
      if (active) {
        setGroups(catalog);
      }
    } catch (error: unknown) {
      if (active) {
        // Xóa kết quả cũ để tránh hiển thị sai khi tìm kiếm lỗi.
        setGroups([]);
        toast.error(getErrorMessage(error));
      }
    } finally {
      if (active) {
        setLoading(false);
      }
    }
  }, keyword ? 250 : 0);

  return () => {
    active = false;
    window.clearTimeout(timer);
  };
}, [search, toast]);